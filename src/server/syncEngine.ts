import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { AuditLogEntry, UserAccount } from '../shared/types.ts';
import { withTransaction } from './db.ts';
import { extractAttachmentsInRecord } from './fileStorage.ts';
import {
  VALID_COLLECTION_SET,
  type ProjectCollectionName,
  type SamaanStore,
} from './store.ts';

export class SyncValidationError extends Error {
  public readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SyncValidationError';
    this.status = status;
  }
}

export type SyncAction = 'upsert' | 'delete';

export interface SyncMutationInput {
  collection: string;
  recordId: string;
  action: SyncAction;
  baseVersion: number;
  data?: unknown;
}

export interface SyncConflictItem {
  collection: ProjectCollectionName;
  recordId: string;
  serverVersion: number;
  clientVersion: number;
  serverData: unknown;
  clientData: unknown;
  serverDeleted?: boolean;
}

export interface SyncAppliedItem {
  collection: ProjectCollectionName;
  recordId: string;
  action: SyncAction;
  version: number;
  data: unknown;
}

export interface SyncResult {
  ok: boolean;
  projectId: string;
  applied: SyncAppliedItem[];
  conflicts: SyncConflictItem[];
  syncedAt: string;
}

export type SyncResolutionChoice = 'use_client' | 'use_server' | 'use_merged' | 'delete';

export interface SyncResolutionInput {
  collection: string;
  recordId: string;
  choice?: SyncResolutionChoice;
  action?: SyncAction;
  expectedServerVersion?: number;
  data?: unknown;
}

export interface SyncResolvedItem {
  collection: ProjectCollectionName;
  recordId: string;
  choice: SyncResolutionChoice;
  version: number;
  data: unknown;
}

export interface SyncResolveResult {
  ok: boolean;
  projectId: string;
  resolved: SyncResolvedItem[];
  conflicts: SyncConflictItem[];
  auditEntryId: string;
  resolvedAt: string;
}

interface NormalizedMutation {
  collection: ProjectCollectionName;
  recordId: string;
  action: SyncAction;
  baseVersion: number;
  data: unknown;
}

interface NormalizedResolution {
  collection: ProjectCollectionName;
  recordId: string;
  choice: SyncResolutionChoice;
  expectedServerVersion?: number;
  data: unknown;
}

function validateCollectionAndRecordId(
  rawCollection: unknown,
  rawRecordId: unknown,
  actorUser: UserAccount,
): { collection: ProjectCollectionName; recordId: string } {
  const collection = String(rawCollection || '').trim();
  if (!VALID_COLLECTION_SET.has(collection)) {
    throw new SyncValidationError(`Unsupported sync collection: "${collection}"`, 400);
  }
  const col = collection as ProjectCollectionName;

  if (col === 'users' && actorUser.role !== 'admin') {
    throw new SyncValidationError(
      'Only administrators are allowed to synchronize user accounts',
      403,
    );
  }

  const recordId =
    col === 'categories' ? 'singleton' : String(rawRecordId || '').trim();
  if (!recordId || recordId.length > 200) {
    throw new SyncValidationError(
      `Invalid recordId for collection "${col}"`,
      400,
    );
  }

  return { collection: col, recordId };
}

function normalizeMutations(
  mutations: SyncMutationInput[],
  actorUser: UserAccount,
): NormalizedMutation[] {
  if (!Array.isArray(mutations)) {
    throw new SyncValidationError('Sync mutations must be an array', 400);
  }
  if (mutations.length > 1000) {
    throw new SyncValidationError('Sync batch exceeds maximum limit of 1000 mutations', 400);
  }

  return mutations.map((m, idx) => {
    if (!m || typeof m !== 'object') {
      throw new SyncValidationError(`Invalid mutation object at index ${idx}`, 400);
    }
    const { collection, recordId } = validateCollectionAndRecordId(
      m.collection,
      m.recordId,
      actorUser,
    );
    const action = m.action === 'delete' ? 'delete' : m.action === 'upsert' ? 'upsert' : null;
    if (!action) {
      throw new SyncValidationError(
        `Invalid sync action at index ${idx}: expected "upsert" or "delete"`,
        400,
      );
    }
    const baseVersion = Number(m.baseVersion);
    if (!Number.isInteger(baseVersion) || baseVersion < 0) {
      throw new SyncValidationError(
        `Invalid baseVersion at index ${idx}: must be a non-negative integer`,
        400,
      );
    }
    if (action === 'upsert' && (!m.data || typeof m.data !== 'object' || Array.isArray(m.data))) {
      throw new SyncValidationError(
        `Mutation at index ${idx} ("upsert") requires an object data payload`,
        400,
      );
    }
    return {
      collection,
      recordId,
      action,
      baseVersion,
      data: action === 'upsert' ? m.data : null,
    };
  });
}

function normalizeResolutions(
  resolutions: SyncResolutionInput[],
  actorUser: UserAccount,
): NormalizedResolution[] {
  if (!Array.isArray(resolutions) || resolutions.length === 0) {
    throw new SyncValidationError('Conflict resolutions must be a non-empty array', 400);
  }
  if (resolutions.length > 500) {
    throw new SyncValidationError('Conflict resolution batch exceeds limit of 500 items', 400);
  }

  return resolutions.map((r, idx) => {
    if (!r || typeof r !== 'object') {
      throw new SyncValidationError(`Invalid resolution object at index ${idx}`, 400);
    }
    const { collection, recordId } = validateCollectionAndRecordId(
      r.collection,
      r.recordId,
      actorUser,
    );

    let choice: SyncResolutionChoice;
    if (
      r.choice === 'use_client' ||
      r.choice === 'use_server' ||
      r.choice === 'use_merged' ||
      r.choice === 'delete'
    ) {
      choice = r.choice;
    } else if (r.action === 'delete') {
      choice = 'delete';
    } else if (r.action === 'upsert') {
      choice = 'use_client';
    } else {
      throw new SyncValidationError(
        `Resolution at index ${idx} must specify a valid choice ("use_client" | "use_server" | "use_merged" | "delete") or action`,
        400,
      );
    }

    let expectedServerVersion: number | undefined;
    if (r.expectedServerVersion !== undefined && r.expectedServerVersion !== null) {
      const parsed = Number(r.expectedServerVersion);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new SyncValidationError(
          `Invalid expectedServerVersion at index ${idx}`,
          400,
        );
      }
      expectedServerVersion = parsed;
    }

    if (
      (choice === 'use_client' || choice === 'use_merged') &&
      (!r.data || typeof r.data !== 'object' || Array.isArray(r.data))
    ) {
      throw new SyncValidationError(
        `Resolution at index ${idx} ("${choice}") requires an object data payload`,
        400,
      );
    }

    return {
      collection,
      recordId,
      choice,
      expectedServerVersion,
      data: choice === 'use_client' || choice === 'use_merged' ? r.data : null,
    };
  });
}

function prepareUpsertPayload(
  projectId: string,
  collection: ProjectCollectionName,
  recordId: string,
  rawData: unknown,
  uploadsRootDir?: string,
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(rawData)) as Record<string, unknown>;
  if (collection !== 'categories' && collection !== 'packingMeta') {
    cloned.id = recordId;
  }
  extractAttachmentsInRecord(projectId, cloned, {
    uploadsRootDir,
    onError: (err, fieldPath) => {
      throw new SyncValidationError(
        `Invalid binary attachment at ${collection}/${recordId}.${fieldPath}: ${err.message}`,
        400,
      );
    },
  });
  return cloned;
}

function readCurrentInMemoryRecord(
  targetStore: SamaanStore,
  collection: ProjectCollectionName,
  recordId: string,
): unknown {
  if (collection === 'categories') {
    return targetStore.db.categories;
  }
  if (collection === 'packingMeta') {
    return targetStore.db.packingMeta[recordId] ?? null;
  }
  const arr = targetStore.db[collection] as unknown as Array<Record<string, unknown>>;
  if (!Array.isArray(arr)) return null;
  const found = arr.find((item) => item && item.id === recordId);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * Executes a conflict-aware offline sync batch atomically.
 * - In PostgreSQL mode: runs inside a single transaction with `SELECT ... FOR UPDATE`,
 *   compares `baseVersion` vs `project_records.version`, commits non-conflicting mutations
 *   (incrementing `version`), and returns exact conflicts without overwriting server data.
 * - Keeps in-memory `targetStore` and `recordVersions` strictly synchronized after commit.
 */
export async function executeProjectSync(params: {
  projectId: string;
  targetStore: SamaanStore;
  mutations: SyncMutationInput[];
  actorUser: UserAccount;
  poolOverride?: Pool;
  uploadsRootDir?: string;
}): Promise<SyncResult> {
  const { projectId, targetStore, actorUser, poolOverride, uploadsRootDir } = params;
  const normalized = normalizeMutations(params.mutations, actorUser);
  const syncedAt = new Date().toISOString();

  if (normalized.length === 0) {
    return {
      ok: true,
      projectId,
      applied: [],
      conflicts: [],
      syncedAt,
    };
  }

  const applied: SyncAppliedItem[] = [];
  const conflicts: SyncConflictItem[] = [];
  const touchedCollections = new Set<ProjectCollectionName>();

  if (targetStore.storageMode === 'postgres') {
    // Ensure any prior in-flight HTTP writes on this project store have committed first
    await targetStore.awaitFlush();

    await withTransaction(async (client) => {
      for (const mut of normalized) {
        const existingRes = await client.query<{
          data: unknown;
          version: number;
          deleted_at: string | Date | null;
        }>(
          `SELECT data, version, deleted_at
           FROM project_records
           WHERE project_id = $1 AND collection_name = $2 AND record_id = $3
           FOR UPDATE`,
          [projectId, mut.collection, mut.recordId],
        );

        const existingRow = existingRes.rows[0];
        const serverVersion = existingRow ? Number(existingRow.version) : 0;

        if (serverVersion !== mut.baseVersion) {
          conflicts.push({
            collection: mut.collection,
            recordId: mut.recordId,
            serverVersion,
            clientVersion: mut.baseVersion,
            serverData: existingRow && !existingRow.deleted_at ? existingRow.data : null,
            clientData: mut.action === 'delete' ? null : mut.data,
            serverDeleted: Boolean(existingRow?.deleted_at),
          });
          continue;
        }

        if (mut.action === 'upsert') {
          const prepared = prepareUpsertPayload(
            projectId,
            mut.collection,
            mut.recordId,
            mut.data,
            uploadsRootDir,
          );
          const res = await client.query<{ version: number }>(
            `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
             VALUES ($1, $2, $3, $4::jsonb, 1, NOW(), $5, NULL)
             ON CONFLICT (project_id, collection_name, record_id) DO UPDATE
               SET data = EXCLUDED.data,
                   version = project_records.version + 1,
                   updated_at = NOW(),
                   updated_by = EXCLUDED.updated_by,
                   deleted_at = NULL
             RETURNING version`,
            [projectId, mut.collection, mut.recordId, JSON.stringify(prepared), actorUser.username],
          );
          const nextVersion = Number(res.rows[0]?.version || serverVersion + 1);
          applied.push({
            collection: mut.collection,
            recordId: mut.recordId,
            action: 'upsert',
            version: nextVersion,
            data: prepared,
          });
          touchedCollections.add(mut.collection);
        } else {
          let nextVersion: number;
          if (existingRow) {
            const res = await client.query<{ version: number }>(
              `UPDATE project_records
               SET deleted_at = NOW(),
                   version = version + 1,
                   updated_at = NOW(),
                   updated_by = $4
               WHERE project_id = $1 AND collection_name = $2 AND record_id = $3
               RETURNING version`,
              [projectId, mut.collection, mut.recordId, actorUser.username],
            );
            nextVersion = Number(res.rows[0]?.version || serverVersion + 1);
          } else {
            const res = await client.query<{ version: number }>(
              `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
               VALUES ($1, $2, $3, '{}'::jsonb, 1, NOW(), $4, NOW())
               RETURNING version`,
              [projectId, mut.collection, mut.recordId, actorUser.username],
            );
            nextVersion = Number(res.rows[0]?.version || 1);
          }
          applied.push({
            collection: mut.collection,
            recordId: mut.recordId,
            action: 'delete',
            version: nextVersion,
            data: null,
          });
          touchedCollections.add(mut.collection);
        }
      }
    }, poolOverride);

    // Mirror committed PostgreSQL mutations into in-memory SamaanStore cache
    for (const item of applied) {
      if (item.action === 'upsert') {
        targetStore.applyCommittedSyncUpsert(
          item.collection,
          item.recordId,
          item.data,
          item.version,
        );
      } else {
        targetStore.applyCommittedSyncDelete(item.collection, item.recordId, item.version);
      }
    }
    if (touchedCollections.size > 0) {
      targetStore.finalizeSyncRefresh(touchedCollections);
    }

    return {
      ok: conflicts.length === 0,
      projectId,
      applied,
      conflicts,
      syncedAt,
    };
  }

  // JSON fallback mode: identical optimistic version-checking semantics
  for (const mut of normalized) {
    const serverVersion = targetStore.getRecordVersion(mut.collection, mut.recordId);
    const currentData = readCurrentInMemoryRecord(targetStore, mut.collection, mut.recordId);

    if (serverVersion !== mut.baseVersion) {
      conflicts.push({
        collection: mut.collection,
        recordId: mut.recordId,
        serverVersion,
        clientVersion: mut.baseVersion,
        serverData: currentData,
        clientData: mut.action === 'delete' ? null : mut.data,
        serverDeleted: serverVersion > 0 && currentData === null,
      });
      continue;
    }

    const nextVersion = serverVersion + 1;
    if (mut.action === 'upsert') {
      const prepared = prepareUpsertPayload(
        projectId,
        mut.collection,
        mut.recordId,
        mut.data,
        uploadsRootDir,
      );
      targetStore.applyCommittedSyncUpsert(mut.collection, mut.recordId, prepared, nextVersion);
      applied.push({
        collection: mut.collection,
        recordId: mut.recordId,
        action: 'upsert',
        version: nextVersion,
        data: prepared,
      });
    } else {
      targetStore.applyCommittedSyncDelete(mut.collection, mut.recordId, nextVersion);
      applied.push({
        collection: mut.collection,
        recordId: mut.recordId,
        action: 'delete',
        version: nextVersion,
        data: null,
      });
    }
    touchedCollections.add(mut.collection);
  }

  if (touchedCollections.size > 0) {
    targetStore.finalizeSyncRefresh(touchedCollections);
  }

  return {
    ok: conflicts.length === 0,
    projectId,
    applied,
    conflicts,
    syncedAt,
  };
}

/**
 * Atomically commits user-chosen conflict resolutions (`use_client`, `use_server`, `use_merged`,
 * or `delete`) inside a PostgreSQL transaction and records a sync conflict-resolution audit log entry.
 */
export async function executeProjectSyncResolve(params: {
  projectId: string;
  targetStore: SamaanStore;
  resolutions: SyncResolutionInput[];
  actorUser: UserAccount;
  poolOverride?: Pool;
  uploadsRootDir?: string;
}): Promise<SyncResolveResult> {
  const { projectId, targetStore, actorUser, poolOverride, uploadsRootDir } = params;
  const normalized = normalizeResolutions(params.resolutions, actorUser);
  const resolvedAt = new Date().toISOString();

  const resolved: SyncResolvedItem[] = [];
  const conflicts: SyncConflictItem[] = [];
  const touchedCollections = new Set<ProjectCollectionName>();

  const auditEntry: AuditLogEntry = {
    id: crypto.randomUUID(),
    timestamp: resolvedAt,
    userId: actorUser.id,
    username: actorUser.username,
    userFullName: actorUser.fullName,
    role: actorUser.role,
    action: 'SYNC_CONFLICT_RESOLVE',
    scope: 'backup',
    targetId: projectId,
    summary: '',
  };

  if (targetStore.storageMode === 'postgres') {
    await targetStore.awaitFlush();

    let auditVersion = 1;
    await withTransaction(async (client) => {
      for (const item of normalized) {
        const existingRes = await client.query<{
          data: unknown;
          version: number;
          deleted_at: string | Date | null;
        }>(
          `SELECT data, version, deleted_at
           FROM project_records
           WHERE project_id = $1 AND collection_name = $2 AND record_id = $3
           FOR UPDATE`,
          [projectId, item.collection, item.recordId],
        );
        const existingRow = existingRes.rows[0];
        const serverVersion = existingRow ? Number(existingRow.version) : 0;

        if (
          item.expectedServerVersion !== undefined &&
          serverVersion !== item.expectedServerVersion
        ) {
          conflicts.push({
            collection: item.collection,
            recordId: item.recordId,
            serverVersion,
            clientVersion: item.expectedServerVersion,
            serverData: existingRow && !existingRow.deleted_at ? existingRow.data : null,
            clientData: item.data,
            serverDeleted: Boolean(existingRow?.deleted_at),
          });
          continue;
        }

        if (item.choice === 'use_server') {
          resolved.push({
            collection: item.collection,
            recordId: item.recordId,
            choice: 'use_server',
            version: serverVersion,
            data: existingRow && !existingRow.deleted_at ? existingRow.data : null,
          });
          continue;
        }

        if (item.choice === 'delete') {
          let nextVersion: number;
          if (existingRow) {
            const res = await client.query<{ version: number }>(
              `UPDATE project_records
               SET deleted_at = NOW(),
                   version = version + 1,
                   updated_at = NOW(),
                   updated_by = $4
               WHERE project_id = $1 AND collection_name = $2 AND record_id = $3
               RETURNING version`,
              [projectId, item.collection, item.recordId, actorUser.username],
            );
            nextVersion = Number(res.rows[0]?.version || serverVersion + 1);
          } else {
            const res = await client.query<{ version: number }>(
              `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
               VALUES ($1, $2, $3, '{}'::jsonb, 1, NOW(), $4, NOW())
               RETURNING version`,
              [projectId, item.collection, item.recordId, actorUser.username],
            );
            nextVersion = Number(res.rows[0]?.version || 1);
          }
          resolved.push({
            collection: item.collection,
            recordId: item.recordId,
            choice: 'delete',
            version: nextVersion,
            data: null,
          });
          touchedCollections.add(item.collection);
          continue;
        }

        const prepared = prepareUpsertPayload(
          projectId,
          item.collection,
          item.recordId,
          item.data,
          uploadsRootDir,
        );
        const res = await client.query<{ version: number }>(
          `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
           VALUES ($1, $2, $3, $4::jsonb, 1, NOW(), $5, NULL)
           ON CONFLICT (project_id, collection_name, record_id) DO UPDATE
             SET data = EXCLUDED.data,
                 version = project_records.version + 1,
                 updated_at = NOW(),
                 updated_by = EXCLUDED.updated_by,
                 deleted_at = NULL
           RETURNING version`,
          [projectId, item.collection, item.recordId, JSON.stringify(prepared), actorUser.username],
        );
        const nextVersion = Number(res.rows[0]?.version || serverVersion + 1);
        resolved.push({
          collection: item.collection,
          recordId: item.recordId,
          choice: item.choice,
          version: nextVersion,
          data: prepared,
        });
        touchedCollections.add(item.collection);
      }

      const countsByChoice = resolved.reduce<Record<string, number>>((acc, r) => {
        acc[r.choice] = (acc[r.choice] || 0) + 1;
        return acc;
      }, {});
      const detailsText = Object.entries(countsByChoice)
        .map(([k, v]) => `${k}:${v}`)
        .join('، ');
      auditEntry.summary = `رفع تعارض همگام‌سازی آفلاین برای ${resolved.length} رکورد (${detailsText || 'بدون تغییر'})`;

      const auditRes = await client.query<{ version: number }>(
        `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
         VALUES ($1, 'auditLogs', $2, $3::jsonb, 1, NOW(), $4, NULL)
         RETURNING version`,
        [projectId, auditEntry.id, JSON.stringify(auditEntry), actorUser.username],
      );
      auditVersion = Number(auditRes.rows[0]?.version || 1);
      touchedCollections.add('auditLogs');
    }, poolOverride);

    for (const item of resolved) {
      if (item.choice === 'use_server') continue;
      if (item.choice === 'delete') {
        targetStore.applyCommittedSyncDelete(item.collection, item.recordId, item.version);
      } else {
        targetStore.applyCommittedSyncUpsert(
          item.collection,
          item.recordId,
          item.data,
          item.version,
        );
      }
    }
    targetStore.applyCommittedSyncUpsert('auditLogs', auditEntry.id, auditEntry, auditVersion);
    targetStore.finalizeSyncRefresh(touchedCollections);

    return {
      ok: conflicts.length === 0,
      projectId,
      resolved,
      conflicts,
      auditEntryId: auditEntry.id,
      resolvedAt,
    };
  }

  // JSON fallback mode
  for (const item of normalized) {
    const serverVersion = targetStore.getRecordVersion(item.collection, item.recordId);
    const currentData = readCurrentInMemoryRecord(targetStore, item.collection, item.recordId);

    if (
      item.expectedServerVersion !== undefined &&
      serverVersion !== item.expectedServerVersion
    ) {
      conflicts.push({
        collection: item.collection,
        recordId: item.recordId,
        serverVersion,
        clientVersion: item.expectedServerVersion,
        serverData: currentData,
        clientData: item.data,
        serverDeleted: serverVersion > 0 && currentData === null,
      });
      continue;
    }

    if (item.choice === 'use_server') {
      resolved.push({
        collection: item.collection,
        recordId: item.recordId,
        choice: 'use_server',
        version: serverVersion,
        data: currentData,
      });
      continue;
    }

    const nextVersion = serverVersion + 1;
    if (item.choice === 'delete') {
      targetStore.applyCommittedSyncDelete(item.collection, item.recordId, nextVersion);
      resolved.push({
        collection: item.collection,
        recordId: item.recordId,
        choice: 'delete',
        version: nextVersion,
        data: null,
      });
    } else {
      const prepared = prepareUpsertPayload(
        projectId,
        item.collection,
        item.recordId,
        item.data,
        uploadsRootDir,
      );
      targetStore.applyCommittedSyncUpsert(item.collection, item.recordId, prepared, nextVersion);
      resolved.push({
        collection: item.collection,
        recordId: item.recordId,
        choice: item.choice,
        version: nextVersion,
        data: prepared,
      });
    }
    touchedCollections.add(item.collection);
  }

  const countsByChoice = resolved.reduce<Record<string, number>>((acc, r) => {
    acc[r.choice] = (acc[r.choice] || 0) + 1;
    return acc;
  }, {});
  const detailsText = Object.entries(countsByChoice)
    .map(([k, v]) => `${k}:${v}`)
    .join('، ');
  auditEntry.summary = `رفع تعارض همگام‌سازی آفلاین برای ${resolved.length} رکورد (${detailsText || 'بدون تغییر'})`;

  targetStore.applyCommittedSyncUpsert('auditLogs', auditEntry.id, auditEntry, 1);
  touchedCollections.add('auditLogs');
  targetStore.finalizeSyncRefresh(touchedCollections);

  return {
    ok: conflicts.length === 0,
    projectId,
    resolved,
    conflicts,
    auditEntryId: auditEntry.id,
    resolvedAt,
  };
}
