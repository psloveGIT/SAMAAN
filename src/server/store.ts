import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import {
  DEFAULT_EMPLOYER_ID,
  ensureDefaultEmployers,
  isBuiltInEmployerId,
  sanitizeEmployerConfig,
  sanitizeEmployerProfile,
} from '../shared/employers.ts';
import type {
  AuditLogEntry,
  BmrDocumentRecord,
  CategoryGroupKey,
  CategoryStore,
  CustomFormSubmission,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  EmployerCustomConfig,
  EmployerId,
  EmployerProfile,
  GcvDocumentRecord,
  GeneralEntry,
  MaterialEstimateRecord,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportRecord,
  PackingStatusMeta,
  PeriodicInspectionRecord,
  PlantAbbreviationPosition,
  ProjectInfo,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
  TrashRecord,
  UserAccount,
} from '../shared/types.ts';
import { sanitizePlantAbbreviation } from '../shared/docNumbering.ts';
import { computeDetailedEntry } from '../shared/formulas.ts';
import { normalizeDigits } from '../shared/jalali.ts';
import {
  DEFAULT_TRANSIT_STATUSES,
  getTransitStatusOptions,
  normalizeCountingUnitToFa,
  normalizeTransitStatus,
} from '../shared/normalizers.ts';
import { sortDetailedEntries, sortGeneralEntries, sortTransitEntries } from '../shared/sorting.ts';
import { registerCategoryTokens, sanitizeCategoryStore } from '../shared/categoryCascade.ts';
import { WarehouseHistoryManager, type HistoryStatus } from '../shared/undoHistory.ts';
import type { StoredUser } from './auth.ts';
import {
  DEFAULT_SEED_PROJECTS,
  ensureAuthSecretInDb,
  getPool,
  isDefaultProjectId,
  resolveStorageMode,
  runMigrations,
  seedDefaultEmployersAndProjects,
  withTransaction,
  type StorageMode,
} from './db.ts';
import { extractAttachmentsInRecord } from './fileStorage.ts';
import {
  ALL_PROJECT_COLLECTIONS,
  migrateJsonToPostgres,
  type ProjectCollectionName,
} from './migrateJsonToPostgres.ts';

export { ALL_PROJECT_COLLECTIONS, type ProjectCollectionName };

export const VALID_COLLECTION_SET = new Set<string>(ALL_PROJECT_COLLECTIONS);

export interface PersistedDatabase {
  version: number;
  sessionSecret: string;
  users: StoredUser[];
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  packingMeta: Record<string, PackingStatusMeta>;
  categories: CategoryStore;
  auditLogs: AuditLogEntry[];
  trash: TrashRecord[];
  opiInvitations: OpiInvitationRecord[];
  siteEntryMinutes: SiteEntryMinutesRecord[];
  opiMinutes: OpiMinutesRecord[];
  osdrReports: OsdrReportRecord[];
  substitutions: SubstitutionRecord[];
  gcvDocuments: GcvDocumentRecord[];
  mivDocuments: MivDocumentRecord[];
  bmrDocuments: BmrDocumentRecord[];
  materialEstimates: MaterialEstimateRecord[];
  periodicInspections: PeriodicInspectionRecord[];
  customFormSubmissions: CustomFormSubmission[];
}

export interface PostgresRecordRow {
  collection_name: string;
  record_id: string;
  data: unknown;
  version: number;
  deleted_at: string | Date | null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'samaan-db.json');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const PROJECTS_REGISTRY_FILE = path.join(DATA_DIR, 'samaan-projects.json');

export function createEmptyCategories(): CategoryStore {
  return {
    island: [],
    system: [],
    subSystem: [],
    unit: [],
    supplier: [],
    dispatchLocation: [],
    origin: [],
    storageLocation: [],
    carrierContractor: [],
    countingUnit: [],
    packageType: [],
    generalDescription: [],
    stocktakeStatus: [],
    transitStatus: [...DEFAULT_TRANSIT_STATUSES],
    receiver: [],
    merStatus: [],
    repStatus: [],
    balanceStatus: [],
    chemicalType: [],
  };
}

export function createEmptyDb(sessionSecret?: string): PersistedDatabase {
  return {
    version: 2,
    sessionSecret: sessionSecret || crypto.randomBytes(32).toString('hex'),
    users: [],
    general: [],
    detailed: [],
    transit: [],
    packingMeta: {},
    categories: createEmptyCategories(),
    auditLogs: [],
    trash: [],
    opiInvitations: [],
    siteEntryMinutes: [],
    opiMinutes: [],
    osdrReports: [],
    substitutions: [],
    gcvDocuments: [],
    mivDocuments: [],
    bmrDocuments: [],
    materialEstimates: [],
    periodicInspections: [],
    customFormSubmissions: [],
  };
}

export function normKey(v: string | undefined | null): string {
  return (v || '').trim();
}

export function makeRecordKey(collectionName: string, recordId: string): string {
  return `${collectionName}:${recordId}`;
}

function normalizeLoadedDatabase(
  parsed: Partial<PersistedDatabase>,
  fallbackSecret?: string,
): PersistedDatabase {
  const empty = createEmptyDb(fallbackSecret);
  const mergedCategories: CategoryStore = {
    ...createEmptyCategories(),
    ...(parsed.categories || {}),
    transitStatus: getTransitStatusOptions(parsed.categories?.transitStatus),
  };
  const detailedList: DetailedEntry[] = (Array.isArray(parsed.detailed) ? parsed.detailed : []).map((d) => ({
    ...d,
    countingUnit: normalizeCountingUnitToFa(d.countingUnit),
  }));
  const transitList: TransitEntry[] = (Array.isArray(parsed.transit) ? parsed.transit : []).map((t) => ({
    ...t,
    overallStatus: normalizeTransitStatus(t.overallStatus, mergedCategories.transitStatus),
  }));
  const materialEstimatesList: MaterialEstimateRecord[] = (
    Array.isArray(parsed.materialEstimates) ? parsed.materialEstimates : []
  ).map((m) => ({
    ...m,
    countingUnit: normalizeCountingUnitToFa(m.countingUnit),
  }));

  return {
    version: parsed.version || 2,
    sessionSecret: parsed.sessionSecret || empty.sessionSecret,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    general: Array.isArray(parsed.general) ? parsed.general : [],
    detailed: detailedList,
    transit: transitList,
    packingMeta: parsed.packingMeta || {},
    categories: mergedCategories,
    auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    trash: Array.isArray(parsed.trash) ? parsed.trash : [],
    opiInvitations: Array.isArray(parsed.opiInvitations) ? parsed.opiInvitations : [],
    siteEntryMinutes: Array.isArray(parsed.siteEntryMinutes) ? parsed.siteEntryMinutes : [],
    opiMinutes: Array.isArray(parsed.opiMinutes) ? parsed.opiMinutes : [],
    osdrReports: Array.isArray(parsed.osdrReports) ? parsed.osdrReports : [],
    substitutions: Array.isArray(parsed.substitutions) ? parsed.substitutions : [],
    gcvDocuments: Array.isArray(parsed.gcvDocuments) ? parsed.gcvDocuments : [],
    mivDocuments: Array.isArray(parsed.mivDocuments) ? parsed.mivDocuments : [],
    bmrDocuments: Array.isArray(parsed.bmrDocuments) ? parsed.bmrDocuments : [],
    materialEstimates: materialEstimatesList,
    periodicInspections: Array.isArray(parsed.periodicInspections) ? parsed.periodicInspections : [],
    customFormSubmissions: Array.isArray(parsed.customFormSubmissions) ? parsed.customFormSubmissions : [],
  };
}

interface RecordSnapshotItem {
  collectionName: ProjectCollectionName;
  recordId: string;
  json: string;
}

function collectCurrentRecordMap(
  projectId: string,
  db: PersistedDatabase,
  extractInlineFiles: boolean,
): Map<string, RecordSnapshotItem> {
  const out = new Map<string, RecordSnapshotItem>();

  const processRecord = (
    collectionName: ProjectCollectionName,
    recordId: string,
    recordValue: unknown,
  ) => {
    if (extractInlineFiles && recordValue && typeof recordValue === 'object') {
      extractAttachmentsInRecord(projectId, recordValue, {
        onError: (err, fieldPath) => {
          console.warn(
            `[store] Skipped extracting invalid attachment at ${projectId}/${collectionName}/${recordId}.${fieldPath}:`,
            err,
          );
        },
      });
    }
    const key = makeRecordKey(collectionName, recordId);
    out.set(key, {
      collectionName,
      recordId,
      json: JSON.stringify(recordValue),
    });
  };

  for (const collectionName of ALL_PROJECT_COLLECTIONS) {
    if (collectionName === 'categories') {
      processRecord('categories', 'singleton', db.categories);
      continue;
    }

    if (collectionName === 'packingMeta') {
      const metaObj = db.packingMeta || {};
      for (const packingKey of Object.keys(metaObj)) {
        const cleanKey = packingKey.trim();
        if (!cleanKey) continue;
        processRecord('packingMeta', cleanKey, metaObj[packingKey]);
      }
      continue;
    }

    const arr = db[collectionName] as unknown as Array<Record<string, unknown>>;
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i += 1) {
      const item = arr[i];
      if (!item || typeof item !== 'object') continue;
      let recordId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
      if (!recordId) {
        recordId = crypto.randomUUID();
        item.id = recordId;
      }
      processRecord(collectionName, recordId, item);
    }
  }

  return out;
}

export class SamaanStore {
  public db: PersistedDatabase;
  public generalRowNos = new Set<string>();
  public detailedRowNos = new Set<string>();
  public transitRowNos = new Set<string>();
  public generalByPacking = new Map<string, GeneralEntry[]>();
  public detailedByPacking = new Map<string, DetailedEntry[]>();
  public transitByPacking = new Map<string, TransitEntry[]>();
  public history = new WarehouseHistoryManager(50);

  /**
   * Synchronized per-record optimistic locking version map (`collection:recordId -> version`),
   * kept strictly aligned with PostgreSQL `project_records.version`.
   */
  public recordVersions = new Map<string, number>();

  private persistedSnapshots = new Map<string, string>();
  private stagedSnapshots = new Map<string, string>();
  private writeChain: Promise<void> = Promise.resolve();
  private pendingWriteCount = 0;
  private lastFlushError: Error | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private currentActor = 'system';

  public readonly dbFile: string;
  public readonly projectId: string;
  public readonly storageMode: StorageMode;
  private readonly poolOverride?: Pool;

  constructor(
    dbFile: string = DB_FILE,
    options?: {
      projectId?: string;
      storageMode?: StorageMode;
      skipDiskLoad?: boolean;
      sessionSecret?: string;
      pool?: Pool;
    },
  ) {
    this.dbFile = dbFile;
    this.projectId = (options?.projectId || 'default').trim().toLowerCase() || 'default';
    this.storageMode = options?.storageMode || 'json';
    this.poolOverride = options?.pool;

    if (options?.skipDiskLoad || this.storageMode === 'postgres') {
      this.db = createEmptyDb(options?.sessionSecret);
    } else {
      this.db = this.loadFromDisk();
    }

    this.renumberScope('general');
    this.renumberScope('detailed');
    this.renumberScope('transit');
    this.rebuildIndexes();

    if (this.storageMode === 'json') {
      const initialMap = collectCurrentRecordMap(this.projectId, this.db, false);
      for (const [key, item] of initialMap.entries()) {
        this.persistedSnapshots.set(key, item.json);
        this.stagedSnapshots.set(key, item.json);
        if (!this.recordVersions.has(key)) {
          this.recordVersions.set(key, 1);
        }
      }
    }
  }

  public setActor(actor?: string | null): void {
    const clean = String(actor || '').trim();
    this.currentActor = clean || 'system';
  }

  public getRecordVersion(collectionName: ProjectCollectionName, recordId: string): number {
    return this.recordVersions.get(makeRecordKey(collectionName, recordId)) || 0;
  }

  public setRecordVersion(
    collectionName: ProjectCollectionName,
    recordId: string,
    version: number,
  ): void {
    this.recordVersions.set(makeRecordKey(collectionName, recordId), version);
  }

  public hasPendingWrites(): boolean {
    return this.pendingWriteCount > 0;
  }

  /**
   * Awaits completion of all queued PostgreSQL commits (or JSON flushes).
   * Rejects if any queued PostgreSQL transaction failed so HTTP handlers never
   * return 200 OK before data is durably committed.
   */
  public async awaitFlush(): Promise<void> {
    if (this.storageMode === 'json' && this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.writeAtomic(this.db);
    }
    await this.writeChain;
    if (this.lastFlushError) {
      const err = this.lastFlushError;
      this.lastFlushError = null;
      throw err;
    }
  }

  /**
   * Hydrates this in-memory store directly from PostgreSQL `project_records` rows,
   * preserving exact database `version` numbers in `recordVersions`.
   */
  public hydrateFromPostgresRows(rows: PostgresRecordRow[], sessionSecret: string): void {
    const partial: Partial<PersistedDatabase> = {
      version: 2,
      sessionSecret,
      users: [],
      general: [],
      detailed: [],
      transit: [],
      packingMeta: {},
      categories: createEmptyCategories(),
      auditLogs: [],
      trash: [],
      opiInvitations: [],
      siteEntryMinutes: [],
      opiMinutes: [],
      osdrReports: [],
      substitutions: [],
      gcvDocuments: [],
      mivDocuments: [],
      bmrDocuments: [],
      materialEstimates: [],
      periodicInspections: [],
      customFormSubmissions: [],
    };

    this.recordVersions.clear();
    this.persistedSnapshots.clear();
    this.stagedSnapshots.clear();

    for (const row of rows) {
      const col = row.collection_name as ProjectCollectionName;
      if (!VALID_COLLECTION_SET.has(col)) continue;
      const key = makeRecordKey(col, row.record_id);
      this.recordVersions.set(key, Number(row.version) || 1);

      if (row.deleted_at) {
        // Keep deleted row's latest version in recordVersions for conflict checks,
        // but omit from active in-memory collection arrays.
        continue;
      }

      if (col === 'categories') {
        if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
          partial.categories = row.data as CategoryStore;
        }
        continue;
      }

      if (col === 'packingMeta') {
        if (!partial.packingMeta) partial.packingMeta = {};
        partial.packingMeta[row.record_id] = row.data as PackingStatusMeta;
        continue;
      }

      const list = partial[col] as unknown as Array<Record<string, unknown>>;
      if (Array.isArray(list) && row.data && typeof row.data === 'object') {
        list.push(row.data as Record<string, unknown>);
      }
    }

    // Keep auditLogs newest-first
    if (Array.isArray(partial.auditLogs)) {
      partial.auditLogs.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    }

    this.db = normalizeLoadedDatabase(partial, sessionSecret);
    this.renumberScope('general');
    this.renumberScope('detailed');
    this.renumberScope('transit');
    this.rebuildIndexes(false);

    // Record exact hydrated baseline so subsequent diffs only flush real mutations
    const baseline = collectCurrentRecordMap(this.projectId, this.db, false);
    for (const [key, item] of baseline.entries()) {
      this.persistedSnapshots.set(key, item.json);
      this.stagedSnapshots.set(key, item.json);
    }
  }

  /**
   * Synchronizes an already-committed PostgreSQL sync upsert into the in-memory store
   * without triggering a redundant write back to PostgreSQL.
   */
  public applyCommittedSyncUpsert(
    collectionName: ProjectCollectionName,
    recordId: string,
    data: unknown,
    version: number,
  ): void {
    const key = makeRecordKey(collectionName, recordId);
    const cloned = JSON.parse(JSON.stringify(data));

    if (collectionName === 'categories') {
      if (cloned && typeof cloned === 'object' && !Array.isArray(cloned)) {
        this.db.categories = {
          ...createEmptyCategories(),
          ...(cloned as Partial<CategoryStore>),
          transitStatus: getTransitStatusOptions((cloned as Partial<CategoryStore>).transitStatus),
        };
      }
    } else if (collectionName === 'packingMeta') {
      this.db.packingMeta[recordId] = cloned as PackingStatusMeta;
    } else {
      const arr = this.db[collectionName] as unknown as Array<Record<string, unknown>>;
      if (cloned && typeof cloned === 'object') {
        (cloned as Record<string, unknown>).id = recordId;
        const idx = arr.findIndex((item) => item && item.id === recordId);
        if (idx >= 0) {
          arr[idx] = cloned as Record<string, unknown>;
        } else if (collectionName === 'auditLogs') {
          arr.unshift(cloned as Record<string, unknown>);
        } else {
          arr.push(cloned as Record<string, unknown>);
        }
      }
    }

    const serialized = JSON.stringify(
      collectionName === 'categories'
        ? this.db.categories
        : collectionName === 'packingMeta'
          ? this.db.packingMeta[recordId]
          : cloned,
    );
    this.recordVersions.set(key, version);
    this.persistedSnapshots.set(key, serialized);
    this.stagedSnapshots.set(key, serialized);
  }

  /**
   * Synchronizes an already-committed PostgreSQL sync soft-delete into the in-memory store.
   */
  public applyCommittedSyncDelete(
    collectionName: ProjectCollectionName,
    recordId: string,
    version: number,
  ): void {
    const key = makeRecordKey(collectionName, recordId);

    if (collectionName === 'categories') {
      this.db.categories = createEmptyCategories();
    } else if (collectionName === 'packingMeta') {
      delete this.db.packingMeta[recordId];
    } else {
      const arr = this.db[collectionName] as unknown as Array<Record<string, unknown>>;
      const idx = arr.findIndex((item) => item && item.id === recordId);
      if (idx >= 0) {
        arr.splice(idx, 1);
      }
    }

    this.recordVersions.set(key, version);
    this.persistedSnapshots.delete(key);
    this.stagedSnapshots.delete(key);
  }

  public finalizeSyncRefresh(touchedCollections: Set<ProjectCollectionName>): void {
    if (touchedCollections.has('general')) this.renumberScope('general');
    if (touchedCollections.has('detailed')) this.renumberScope('detailed');
    if (touchedCollections.has('transit')) this.renumberScope('transit');
    if (
      touchedCollections.has('general') ||
      touchedCollections.has('detailed') ||
      touchedCollections.has('transit') ||
      touchedCollections.has('categories')
    ) {
      this.rebuildIndexes(!touchedCollections.has('categories'));
    }
    if (this.storageMode === 'json') {
      this.writeAtomic(this.db);
    }
  }

  private loadFromDisk(): PersistedDatabase {
    try {
      const dir = path.dirname(this.dbFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.dbFile)) {
        const empty = createEmptyDb();
        this.writeAtomic(empty);
        return empty;
      }
      const raw = fs.readFileSync(this.dbFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedDatabase>;
      return normalizeLoadedDatabase(parsed);
    } catch (err) {
      console.error('Failed to load local database file, starting fresh:', err);
      return createEmptyDb();
    }
  }

  private writeAtomic(data: PersistedDatabase): void {
    const dir = path.dirname(this.dbFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.dbFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, this.dbFile);
  }

  private enqueuePostgresDeltaFlush(actor: string): void {
    const currentMap = collectCurrentRecordMap(this.projectId, this.db, true);

    const upserts: RecordSnapshotItem[] = [];
    const deletes: Array<{ key: string; collectionName: ProjectCollectionName; recordId: string }> = [];

    for (const [key, item] of currentMap.entries()) {
      const prevJson = this.stagedSnapshots.get(key);
      if (prevJson !== item.json) {
        upserts.push(item);
      }
    }

    for (const prevKey of this.stagedSnapshots.keys()) {
      if (!currentMap.has(prevKey)) {
        const sepIdx = prevKey.indexOf(':');
        if (sepIdx > 0) {
          const collectionName = prevKey.slice(0, sepIdx) as ProjectCollectionName;
          const recordId = prevKey.slice(sepIdx + 1);
          deletes.push({ key: prevKey, collectionName, recordId });
        }
      }
    }

    if (upserts.length === 0 && deletes.length === 0) {
      return;
    }

    // Advance staged snapshots immediately so sequential mutations compute minimal deltas
    for (const u of upserts) {
      this.stagedSnapshots.set(makeRecordKey(u.collectionName, u.recordId), u.json);
    }
    for (const d of deletes) {
      this.stagedSnapshots.delete(d.key);
    }

    this.pendingWriteCount += 1;
    const runFlush = async () => {
      try {
        const committedVersions = await withTransaction(async (client) => {
          const nextVersions = new Map<string, number>();

          for (const u of upserts) {
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
              [this.projectId, u.collectionName, u.recordId, u.json, actor],
            );
            const ver = Number(res.rows[0]?.version || 1);
            nextVersions.set(makeRecordKey(u.collectionName, u.recordId), ver);
          }

          for (const d of deletes) {
            const res = await client.query<{ version: number }>(
              `UPDATE project_records
               SET deleted_at = NOW(),
                   version = version + 1,
                   updated_at = NOW(),
                   updated_by = $4
               WHERE project_id = $1 AND collection_name = $2 AND record_id = $3 AND deleted_at IS NULL
               RETURNING version`,
              [this.projectId, d.collectionName, d.recordId, actor],
            );
            if (res.rows[0]?.version !== undefined) {
              nextVersions.set(d.key, Number(res.rows[0].version));
            }
          }

          return nextVersions;
        }, this.poolOverride);

        // Strictly synchronize in-memory recordVersions and persistedSnapshots with committed DB state
        for (const [key, ver] of committedVersions.entries()) {
          this.recordVersions.set(key, ver);
        }
        for (const u of upserts) {
          this.persistedSnapshots.set(makeRecordKey(u.collectionName, u.recordId), u.json);
        }
        for (const d of deletes) {
          this.persistedSnapshots.delete(d.key);
        }
      } catch (err) {
        // Restore stagedSnapshots to committed state so future writes retry cleanly
        this.stagedSnapshots = new Map(this.persistedSnapshots);
        const errorObj = err instanceof Error ? err : new Error(String(err));
        this.lastFlushError = errorObj;
        console.error(`[store] PostgreSQL flush failed for project ${this.projectId}:`, errorObj);
      } finally {
        this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
      }
    };

    this.writeChain = this.writeChain.then(runFlush, runFlush);
  }

  private syncJsonVersionsAndExtract(): void {
    const currentMap = collectCurrentRecordMap(this.projectId, this.db, true);
    for (const [key, item] of currentMap.entries()) {
      const prevJson = this.persistedSnapshots.get(key);
      if (prevJson !== item.json) {
        const nextVer = (this.recordVersions.get(key) || 0) + 1;
        this.recordVersions.set(key, nextVer);
        this.persistedSnapshots.set(key, item.json);
        this.stagedSnapshots.set(key, item.json);
      }
    }
    for (const prevKey of Array.from(this.persistedSnapshots.keys())) {
      if (!currentMap.has(prevKey)) {
        const nextVer = (this.recordVersions.get(prevKey) || 0) + 1;
        this.recordVersions.set(prevKey, nextVer);
        this.persistedSnapshots.delete(prevKey);
        this.stagedSnapshots.delete(prevKey);
      }
    }
  }

  public saveImmediate(actor?: string): void {
    const effectiveActor = actor || this.currentActor || 'system';
    if (this.storageMode === 'postgres') {
      this.enqueuePostgresDeltaFlush(effectiveActor);
      return;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.syncJsonVersionsAndExtract();
    this.writeAtomic(this.db);
  }

  public scheduleSave(actor?: string): void {
    const effectiveActor = actor || this.currentActor || 'system';
    if (this.storageMode === 'postgres') {
      // In PostgreSQL mode always enqueue immediately so Express can await durable commit
      this.enqueuePostgresDeltaFlush(effectiveActor);
      return;
    }
    this.syncJsonVersionsAndExtract();
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeAtomic(this.db);
    }, 300);
  }

  /**
   * Sorts General / Detailed deterministically and numbers rows 1..N sequentially.
   */
  public renumberScope(scope: 'general' | 'detailed' | 'transit'): void {
    if (scope === 'general') {
      sortGeneralEntries(this.db.general);
      for (let i = 0; i < this.db.general.length; i += 1) {
        this.db.general[i].rowNo = String(i + 1);
      }
      return;
    }
    if (scope === 'detailed') {
      sortDetailedEntries(this.db.detailed);
      for (let i = 0; i < this.db.detailed.length; i += 1) {
        this.db.detailed[i].rowNo = String(i + 1);
      }
      return;
    }
    sortTransitEntries(this.db.transit);
    for (let i = 0; i < this.db.transit.length; i += 1) {
      this.db.transit[i].rowNo = String(i + 1);
    }
  }

  public rebuildIndexes(syncCategories = true): void {
    this.generalRowNos.clear();
    this.detailedRowNos.clear();
    this.transitRowNos.clear();
    this.generalByPacking.clear();
    this.detailedByPacking.clear();
    this.transitByPacking.clear();

    for (const g of this.db.general) {
      const rn = normKey(g.rowNo);
      if (rn) this.generalRowNos.add(rn);
      const pk = normKey(g.packingListNo);
      if (pk) {
        const list = this.generalByPacking.get(pk) || [];
        list.push(g);
        this.generalByPacking.set(pk, list);
      }
      if (syncCategories) {
        this.registerCategoriesFromFields({
          island: g.island,
          system: g.system,
          subSystem: g.subSystem,
          unit: g.unit,
          supplier: g.supplier,
          dispatchLocation: g.dispatchLocation,
          packageType: g.packageType,
        });
      }
    }

    for (const d of this.db.detailed) {
      const rn = normKey(d.rowNo);
      if (rn) this.detailedRowNos.add(rn);
      const pk = normKey(d.shipmentNo);
      if (pk) {
        const list = this.detailedByPacking.get(pk) || [];
        list.push(d);
        this.detailedByPacking.set(pk, list);
      }
      if (syncCategories) {
        this.registerCategoriesFromFields({
          island: d.island,
          system: d.system,
          subSystem: d.subSystem,
          unit: d.unit,
          supplier: d.supplier,
          origin: d.origin,
          storageLocation: d.storageLocation,
          countingUnit: d.countingUnit,
          generalDescription: d.generalDescription,
          stocktakeStatus: d.stocktakeStatus,
          receiver: d.receiver,
          merStatus: d.merStatus,
          repStatus: d.repStatus,
          balanceStatus: d.balanceStatus,
          chemicalType: d.chemicalType,
        });
      }
    }

    for (const t of this.db.transit) {
      const rn = normKey(t.rowNo);
      if (rn) this.transitRowNos.add(rn);
      const pk = normKey(t.packingListNo);
      if (pk) {
        const list = this.transitByPacking.get(pk) || [];
        list.push(t);
        this.transitByPacking.set(pk, list);
      }
      if (syncCategories) {
        this.registerCategoriesFromFields({
          system: t.system,
          subSystem: t.subSystem,
          unit: t.unit,
          supplier: t.supplier,
          dispatchLocation: t.dispatchLocation,
          carrierContractor: t.carrierContractor,
          transitStatus: t.overallStatus,
        });
      }
    }
    sanitizeCategoryStore(this.db.categories);
  }

  public registerCategoryValue(group: CategoryGroupKey, rawVal: string | undefined | null): void {
    registerCategoryTokens(this.db.categories, group, rawVal);
  }

  public registerCategoriesFromFields(fields: Partial<Record<CategoryGroupKey, string>>): void {
    (Object.keys(fields) as CategoryGroupKey[]).forEach((k) => {
      this.registerCategoryValue(k, fields[k]);
    });
  }

  public nextSuggestedRowNo(scope: 'general' | 'detailed' | 'transit'): string {
    const arr =
      scope === 'general'
        ? this.db.general
        : scope === 'detailed'
          ? this.db.detailed
          : this.db.transit;
    return String(arr.length + 1);
  }

  public isRowNoTaken(scope: 'general' | 'detailed' | 'transit', rowNo: string, excludeId?: string): boolean {
    const target = normKey(rowNo);
    if (!target) return false;
    const arr =
      scope === 'general'
        ? this.db.general
        : scope === 'detailed'
          ? this.db.detailed
          : this.db.transit;
    return arr.some((item) => normKey(item.rowNo) === target && item.id !== excludeId);
  }

  public isMapnaMinutesTaken(_minutesNo: string, _excludeId?: string): boolean {
    return false;
  }

  public isDetailedItemNoTaken(
    shipmentNo: string,
    packageNo: string,
    itemNo: string,
    excludeId?: string,
  ): boolean {
    const pk = normKey(shipmentNo).toLowerCase();
    const pkg = normKey(packageNo).toLowerCase();
    const itm = normalizeDigits(normKey(itemNo)).toLowerCase();
    if (!pk || !itm) return false;
    return this.db.detailed.some(
      (d) =>
        d.id !== excludeId &&
        normKey(d.shipmentNo).toLowerCase() === pk &&
        normKey(d.packageNo).toLowerCase() === pkg &&
        normalizeDigits(normKey(d.itemNo)).toLowerCase() === itm,
    );
  }

  public getNextSuggestedItemNo(shipmentNo: string, packageNo: string): string {
    const pk = normKey(shipmentNo).toLowerCase();
    const pkg = normKey(packageNo).toLowerCase();
    if (!pk) return '1';
    const matching = this.db.detailed.filter(
      (d) =>
        normKey(d.shipmentNo).toLowerCase() === pk &&
        (!pkg || normKey(d.packageNo).toLowerCase() === pkg),
    );
    if (matching.length === 0) return '1';
    let maxNum = 0;
    for (const d of matching) {
      const parsed = Number(normalizeDigits(normKey(d.itemNo)));
      if (Number.isInteger(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
    let candidate = maxNum + 1;
    while (this.isDetailedItemNoTaken(shipmentNo, packageNo, String(candidate))) {
      candidate += 1;
    }
    return String(candidate);
  }

  public getGeneralSharedInfo(packingNo: string, packageNo?: string) {
    const pk = normKey(packingNo);
    if (!pk) return null;
    const list = this.generalByPacking.get(pk) || [];
    if (list.length === 0) return null;
    const pkg = normKey(packageNo);
    const exact = pkg ? list.find((g) => normKey(g.packageNo) === pkg) : undefined;
    const match = exact || list[0];
    const detMatches = (this.detailedByPacking.get(pk) || []).filter(
      (d) => !pkg || normKey(d.packageNo) === pkg,
    );
    return {
      arrivalDate: match.arrivalDate,
      supplier: match.supplier,
      dispatchLocation: match.dispatchLocation,
      island: match.island,
      system: match.system,
      subSystem: match.subSystem,
      unit: match.unit,
      packageNo: match.packageNo,
      expectedItemCount: exact?.itemCount ?? match.itemCount ?? null,
      existingDetailedCount: detMatches.length,
      packagesForPacking: Array.from(new Set(list.map((g) => normKey(g.packageNo)).filter(Boolean))),
      packageCounts: list
        .filter((g) => normKey(g.packageNo))
        .map((g) => ({
          packageNo: normKey(g.packageNo),
          itemCount: g.itemCount ?? null,
        })),
    };
  }

  public getLastDetailedDefaults() {
    if (this.db.detailed.length === 0) return { shipmentNo: '', packageNo: '', countingUnit: 'عدد' };
    let latest = this.db.detailed[0];
    for (const d of this.db.detailed) {
      if ((d.createdAt || '') > (latest.createdAt || '')) {
        latest = d;
      }
    }
    return {
      shipmentNo: normKey(latest.shipmentNo),
      packageNo: normKey(latest.packageNo),
      countingUnit: normalizeCountingUnitToFa(latest.countingUnit) || 'عدد',
    };
  }

  public addAudit(params: {
    user: UserAccount;
    action: string;
    scope: AuditLogEntry['scope'];
    targetId: string;
    summary: string;
  }): void {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: params.user.id,
      username: params.user.username,
      userFullName: params.user.fullName,
      role: params.user.role,
      action: params.action,
      scope: params.scope,
      targetId: params.targetId,
      summary: params.summary,
    };
    this.db.auditLogs.unshift(entry);
    if (this.db.auditLogs.length > 50000) {
      this.db.auditLogs.length = 50000;
    }
  }

  public syncTransitArrival(packingNo: string, user: UserAccount): number {
    const pk = normKey(packingNo);
    if (!pk) return 0;
    const matches = this.transitByPacking.get(pk);
    if (!matches || matches.length === 0) return 0;

    const genMatches = this.generalByPacking.get(pk) || [];
    const genArrival = genMatches.find((g) => normKey(g.arrivalDate))?.arrivalDate || '';

    let updated = 0;
    const now = new Date().toISOString();
    for (const t of matches) {
      const st = normKey(t.overallStatus);
      const needsStatus = st !== 'رسیده';
      const needsDate = Boolean(genArrival && normKey(t.arrivalDate) !== normKey(genArrival));
      if (needsStatus || needsDate) {
        if (needsStatus) {
          t.overallStatus = 'رسیده';
        }
        if (genArrival) {
          t.arrivalDate = genArrival;
        }
        t.linkedGeneralPackingNo = pk;
        t.updatedAt = now;
        updated += 1;
      }
    }
    if (updated > 0) {
      this.renumberScope('transit');
      this.addAudit({
        user,
        action: 'AUTO_TRANSIT_ARRIVED',
        scope: 'transit',
        targetId: pk,
        summary: `به‌روزرسانی خودکار وضعیت «رسیده» و تاریخ ورود برای ${updated} ردیف در راه (پکینگ ${pk})`,
      });
    }
    return updated;
  }

  public getDetailedComputedList(): DetailedComputed[] {
    return this.db.detailed.map(computeDetailedEntry);
  }

  public exportSnapshot(): DatabaseSnapshot {
    return {
      version: this.db.version,
      exportedAt: new Date().toISOString(),
      general: this.db.general,
      detailed: this.db.detailed,
      transit: this.db.transit,
      packingMeta: this.db.packingMeta,
      categories: this.db.categories,
      auditLogs: this.db.auditLogs,
      trash: this.db.trash,
      opiInvitations: this.db.opiInvitations,
      siteEntryMinutes: this.db.siteEntryMinutes,
      opiMinutes: this.db.opiMinutes,
      osdrReports: this.db.osdrReports,
      substitutions: this.db.substitutions,
      gcvDocuments: this.db.gcvDocuments,
      mivDocuments: this.db.mivDocuments,
      bmrDocuments: this.db.bmrDocuments,
      materialEstimates: this.db.materialEstimates,
      periodicInspections: this.db.periodicInspections,
      customFormSubmissions: this.db.customFormSubmissions,
    };
  }

  public restoreSnapshot(snapshot: DatabaseSnapshot, user: UserAccount): void {
    const nextCategories: CategoryStore = {
      ...createEmptyCategories(),
      ...(snapshot.categories || {}),
      transitStatus: getTransitStatusOptions(snapshot.categories?.transitStatus),
    };
    this.db.general = Array.isArray(snapshot.general) ? snapshot.general : [];
    this.db.detailed = (Array.isArray(snapshot.detailed) ? snapshot.detailed : []).map((d) => ({
      ...d,
      countingUnit: normalizeCountingUnitToFa(d.countingUnit),
    }));
    this.db.transit = (Array.isArray(snapshot.transit) ? snapshot.transit : []).map((t) => ({
      ...t,
      overallStatus: normalizeTransitStatus(t.overallStatus, nextCategories.transitStatus),
    }));
    this.db.packingMeta = snapshot.packingMeta || {};
    this.db.categories = nextCategories;
    if (Array.isArray(snapshot.auditLogs)) {
      this.db.auditLogs = snapshot.auditLogs;
    }
    this.db.trash = Array.isArray(snapshot.trash) ? snapshot.trash : [];
    this.db.opiInvitations = Array.isArray(snapshot.opiInvitations) ? snapshot.opiInvitations : [];
    this.db.siteEntryMinutes = Array.isArray(snapshot.siteEntryMinutes) ? snapshot.siteEntryMinutes : [];
    this.db.opiMinutes = Array.isArray(snapshot.opiMinutes) ? snapshot.opiMinutes : [];
    this.db.osdrReports = Array.isArray(snapshot.osdrReports) ? snapshot.osdrReports : [];
    this.db.substitutions = Array.isArray(snapshot.substitutions) ? snapshot.substitutions : [];
    this.db.gcvDocuments = Array.isArray(snapshot.gcvDocuments) ? snapshot.gcvDocuments : [];
    this.db.mivDocuments = Array.isArray(snapshot.mivDocuments) ? snapshot.mivDocuments : [];
    this.db.bmrDocuments = Array.isArray(snapshot.bmrDocuments) ? snapshot.bmrDocuments : [];
    this.db.materialEstimates = (Array.isArray(snapshot.materialEstimates) ? snapshot.materialEstimates : []).map((m) => ({
      ...m,
      countingUnit: normalizeCountingUnitToFa(m.countingUnit),
    }));
    this.db.periodicInspections = Array.isArray(snapshot.periodicInspections) ? snapshot.periodicInspections : [];
    this.db.customFormSubmissions = Array.isArray(snapshot.customFormSubmissions) ? snapshot.customFormSubmissions : [];
    this.renumberScope('general');
    this.renumberScope('detailed');
    this.renumberScope('transit');
    this.rebuildIndexes();
    this.history.clear();
    this.addAudit({
      user,
      action: 'RESTORE_SNAPSHOT',
      scope: 'backup',
      targetId: 'database',
      summary: `بازیابی کامل نسخه پشتیبان (${this.db.general.length} جنرال، ${this.db.detailed.length} دیتیل، ${this.db.transit.length} در راه)`,
    });
    this.saveImmediate(user.username);
  }

  public applyHistoryAction(
    direction: 'undo' | 'redo',
    user: UserAccount,
  ): {
    labelFa: string;
    labelEn: string;
    status: HistoryStatus;
  } | null {
    const res = direction === 'undo' ? this.history.undo(this.db) : this.history.redo(this.db);
    if (!res) return null;

    if (res.touchedScopes.has('general')) this.renumberScope('general');
    if (res.touchedScopes.has('detailed')) this.renumberScope('detailed');
    if (res.touchedScopes.has('transit')) this.renumberScope('transit');
    this.rebuildIndexes(!res.touchedScopes.has('categories'));

    this.addAudit({
      user,
      action: direction === 'undo' ? 'UNDO_ACTION' : 'REDO_ACTION',
      scope: 'history',
      targetId: res.command.id,
      summary:
        direction === 'undo'
          ? `بازگردانی عملیات (Undo): ${res.command.labelFa}`
          : `انجام مجدد عملیات (Redo): ${res.command.labelFa}`,
    });
    this.saveImmediate(user.username);
    return {
      labelFa: res.command.labelFa,
      labelEn: res.command.labelEn,
      status: this.history.getStatus(),
    };
  }
}

interface ProjectRegistryData {
  authSecret: string;
  projects: ProjectInfo[];
  employers: EmployerProfile[];
}

function sanitizeProjectId(raw: string): string {
  return (raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function ensureDefaultProjectsInList(
  existing: ProjectInfo[],
  validEmployerIds: Set<string>,
): ProjectInfo[] {
  const byId = new Map<string, ProjectInfo>();
  for (const p of existing) {
    if (p && p.id) {
      const cleanId = sanitizeProjectId(p.id);
      if (!cleanId) continue;
      const cleanAbbr = sanitizePlantAbbreviation(p.plantAbbreviation);
      const pos: PlantAbbreviationPosition =
        p.plantAbbreviationPosition === 'before_number' ? 'before_number' : 'prefix';
      const empId =
        typeof p.employerId === 'string' && validEmployerIds.has(p.employerId.trim())
          ? p.employerId.trim()
          : DEFAULT_EMPLOYER_ID;
      byId.set(cleanId, {
        ...p,
        id: cleanId,
        contractRef: typeof p.contractRef === 'string' && p.contractRef.trim() ? p.contractRef.trim() : undefined,
        employerId: empId,
        employerConfig: sanitizeEmployerConfig(p.employerConfig),
        plantAbbreviation: cleanAbbr || undefined,
        usePlantAbbreviationInDocs: Boolean(p.usePlantAbbreviationInDocs && cleanAbbr),
        plantAbbreviationPosition: pos,
        isDefault: Boolean(p.isDefault || isDefaultProjectId(cleanId)),
      });
    }
  }

  const orderedDefaults: ProjectInfo[] = DEFAULT_SEED_PROJECTS.map((seed) => {
    const saved = byId.get(seed.id);
    if (saved) {
      return { ...saved, isDefault: true };
    }
    return { ...seed };
  });

  const customProjects = Array.from(byId.values()).filter((p) => !isDefaultProjectId(p.id));
  return [...orderedDefaults, ...customProjects];
}

export class ProjectManager {
  private registry: ProjectRegistryData;
  private stores = new Map<string, SamaanStore>();
  private storageMode: StorageMode = 'json';
  private initialized = false;
  private registryWriteChain: Promise<void> = Promise.resolve();
  private pendingRegistryWrites = 0;
  private lastRegistryError: Error | null = null;

  constructor() {
    // Load synchronous JSON defaults initially; `await projectManager.init()` upgrades to PostgreSQL on server boot.
    this.registry = this.loadRegistryFromJson();
  }

  public getStorageMode(): StorageMode {
    return this.storageMode;
  }

  public hasPendingWrites(): boolean {
    return this.pendingRegistryWrites > 0;
  }

  public async awaitRegistryFlush(): Promise<void> {
    await this.registryWriteChain;
    if (this.lastRegistryError) {
      const err = this.lastRegistryError;
      this.lastRegistryError = null;
      throw err;
    }
  }

  private enqueueRegistryWrite(task: () => Promise<void>): void {
    if (this.storageMode !== 'postgres') return;
    this.pendingRegistryWrites += 1;
    const wrapped = async () => {
      try {
        await task();
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        this.lastRegistryError = errorObj;
        console.error('[ProjectManager] PostgreSQL registry write failed:', errorObj);
      } finally {
        this.pendingRegistryWrites = Math.max(0, this.pendingRegistryWrites - 1);
      }
    };
    this.registryWriteChain = this.registryWriteChain.then(wrapped, wrapped);
  }

  /**
   * Initializes persistence backend on server boot.
   * When `SAMAAN_STORAGE_MODE=postgres` (or `DATABASE_URL` is configured):
   * 1. Runs `001_init.sql` migrations
   * 2. Seeds built-in employers & default projects (one per built-in employer)
   * 3. Runs one-time idempotent JSON-to-PostgreSQL migration if not yet completed
   * 4. Hydrates employers, projects, and all project stores with exact `version` numbers
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    this.storageMode = resolveStorageMode();

    if (this.storageMode === 'json') {
      this.registry = this.loadRegistryFromJson();
      this.initialized = true;
      console.log('[store] Storage initialized in JSON mode.');
      return;
    }

    await runMigrations();
    await seedDefaultEmployersAndProjects();
    const migration = await migrateJsonToPostgres();
    if (!migration.skipped) {
      console.log(
        `[store] Migrated legacy JSON to PostgreSQL: ${migration.employersImported} employers, ${migration.projectsImported} projects, ${migration.recordsImported} records, ${migration.attachmentsExtracted} extracted attachments, ${migration.globalLogsImported} global logs.`,
      );
    }

    const pool = getPool();
    const authSecret = await ensureAuthSecretInDb(pool);

    const empRes = await pool.query<{ id: string; is_default: boolean; data: EmployerProfile }>(
      `SELECT id, is_default, data FROM employers ORDER BY is_default DESC, created_at ASC`,
    );
    const loadedEmployers = empRes.rows
      .map((r) => sanitizeEmployerProfile({ ...r.data, id: r.id, isBuiltIn: r.is_default || isBuiltInEmployerId(r.id) }))
      .filter((e): e is EmployerProfile => Boolean(e));
    const employers = ensureDefaultEmployers(loadedEmployers);
    const validEmpIds = new Set(employers.map((e) => e.id));

    const projRes = await pool.query<{
      id: string;
      employer_id: string;
      is_default: boolean;
      meta: ProjectInfo;
      session_secret: string;
      created_at: Date;
    }>(
      `SELECT id, employer_id, is_default, meta, session_secret, created_at
       FROM projects
       ORDER BY is_default DESC, created_at ASC`,
    );

    const projects: ProjectInfo[] = projRes.rows.map((r) => {
      const m = r.meta || ({} as ProjectInfo);
      const cleanAbbr = sanitizePlantAbbreviation(m.plantAbbreviation);
      const pos: PlantAbbreviationPosition =
        m.plantAbbreviationPosition === 'before_number' ? 'before_number' : 'prefix';
      return {
        ...m,
        id: r.id,
        name: String(m.name || r.id).trim(),
        employerId: validEmpIds.has(r.employer_id) ? r.employer_id : DEFAULT_EMPLOYER_ID,
        isDefault: Boolean(r.is_default || isDefaultProjectId(r.id)),
        plantAbbreviation: cleanAbbr || undefined,
        usePlantAbbreviationInDocs: Boolean(m.usePlantAbbreviationInDocs && cleanAbbr),
        plantAbbreviationPosition: pos,
        createdAt: m.createdAt || r.created_at.toISOString(),
      };
    });

    this.registry = {
      authSecret,
      projects,
      employers,
    };

    this.stores.clear();
    for (const row of projRes.rows) {
      const projStore = new SamaanStore(this.resolveDbPath(row.id), {
        projectId: row.id,
        storageMode: 'postgres',
        skipDiskLoad: true,
        sessionSecret: row.session_secret,
      });

      const recRes = await pool.query<PostgresRecordRow>(
        `SELECT collection_name, record_id, data, version, deleted_at
         FROM project_records
         WHERE project_id = $1`,
        [row.id],
      );
      projStore.hydrateFromPostgresRows(recRes.rows, row.session_secret);
      this.stores.set(row.id, projStore);
    }

    this.initialized = true;
    console.log(
      `[store] Storage initialized in PostgreSQL mode (${employers.length} employers, ${projects.length} projects hydrated).`,
    );
  }

  private loadRegistryFromJson(): ProjectRegistryData {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(PROJECTS_REGISTRY_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(PROJECTS_REGISTRY_FILE, 'utf8')) as Partial<ProjectRegistryData>;
        const rawEmployers: EmployerProfile[] = Array.isArray(parsed.employers)
          ? parsed.employers
              .map(sanitizeEmployerProfile)
              .filter((e): e is EmployerProfile => Boolean(e))
          : [];
        const employers = ensureDefaultEmployers(rawEmployers);
        const validEmpIds = new Set(employers.map((e) => e.id));
        const rawList = Array.isArray(parsed.projects) ? parsed.projects : [];
        const projects = ensureDefaultProjectsInList(rawList, validEmpIds);
        const loaded: ProjectRegistryData = {
          authSecret: parsed.authSecret || crypto.randomBytes(32).toString('hex'),
          projects,
          employers,
        };
        if (rawEmployers.length !== employers.length || rawList.length !== projects.length) {
          this.saveRegistryDataJson(loaded);
        }
        return loaded;
      }
    } catch (err) {
      console.error('Failed to load project registry, initializing defaults:', err);
    }
    const employers = ensureDefaultEmployers([]);
    const validEmpIds = new Set(employers.map((e) => e.id));
    const initial: ProjectRegistryData = {
      authSecret: crypto.randomBytes(32).toString('hex'),
      projects: ensureDefaultProjectsInList([], validEmpIds),
      employers,
    };
    this.saveRegistryDataJson(initial);
    return initial;
  }

  private saveRegistryDataJson(data: ProjectRegistryData): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${PROJECTS_REGISTRY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, PROJECTS_REGISTRY_FILE);
  }

  public getAuthSecret(): string {
    return this.registry.authSecret;
  }

  public listProjects(): ProjectInfo[] {
    return [...this.registry.projects];
  }

  public getProject(id: string): ProjectInfo | undefined {
    const clean = sanitizeProjectId(id);
    return this.registry.projects.find((p) => p.id === clean);
  }

  private resolveDbPath(id: string): string {
    if (id === 'default') return DB_FILE;
    if (this.storageMode === 'json' && !fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
    return path.join(PROJECTS_DIR, `${id}.json`);
  }

  public resolveProjectId(rawId?: string | null): string {
    const clean = sanitizeProjectId(rawId || '');
    if (clean && this.registry.projects.some((p) => p.id === clean)) {
      return clean;
    }
    return this.registry.projects[0]?.id || 'default';
  }

  public getStore(rawProjectId?: string | null): SamaanStore {
    const id = this.resolveProjectId(rawProjectId);
    let existing = this.stores.get(id);
    if (!existing) {
      existing = new SamaanStore(this.resolveDbPath(id), {
        projectId: id,
        storageMode: this.storageMode,
        skipDiskLoad: this.storageMode === 'postgres',
      });
      this.stores.set(id, existing);
    }
    return existing;
  }

  public createProject(params: {
    name: string;
    code?: string;
    contractRef?: string;
    employerId?: EmployerId;
    employerConfig?: EmployerCustomConfig;
    plantAbbreviation?: string;
    usePlantAbbreviationInDocs?: boolean;
    plantAbbreviationPosition?: PlantAbbreviationPosition;
    copyUsersFromStore?: SamaanStore | null;
  }): ProjectInfo {
    const cleanName = normKey(params.name);
    const cleanCode = normKey(params.code);
    const cleanContractRef = normKey(params.contractRef);
    const cleanAbbr = sanitizePlantAbbreviation(params.plantAbbreviation);
    const abbrPos: PlantAbbreviationPosition =
      params.plantAbbreviationPosition === 'before_number' ? 'before_number' : 'prefix';
    const baseSlug =
      cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20) || 'project';
    const rand = crypto.randomBytes(3).toString('hex');
    const id = `proj-${baseSlug}-${rand}`;

    const requestedEmpId =
      typeof params.employerId === 'string' && params.employerId.trim()
        ? params.employerId.trim()
        : DEFAULT_EMPLOYER_ID;
    const employerExists = this.listEmployers().some((e) => e.id === requestedEmpId);
    const empId = employerExists ? requestedEmpId : DEFAULT_EMPLOYER_ID;

    const info: ProjectInfo = {
      id,
      name: cleanName,
      code: cleanCode || undefined,
      contractRef: cleanContractRef || undefined,
      employerId: empId,
      employerConfig: sanitizeEmployerConfig(params.employerConfig),
      plantAbbreviation: cleanAbbr || undefined,
      usePlantAbbreviationInDocs: Boolean(params.usePlantAbbreviationInDocs && cleanAbbr),
      plantAbbreviationPosition: abbrPos,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    const sessionSecret = crypto.randomBytes(32).toString('hex');
    const newStore = new SamaanStore(this.resolveDbPath(id), {
      projectId: id,
      storageMode: this.storageMode,
      skipDiskLoad: this.storageMode === 'postgres',
      sessionSecret,
    });

    this.registry.projects.push(info);
    this.stores.set(id, newStore);

    if (this.storageMode === 'postgres') {
      const copiedUsers =
        params.copyUsersFromStore && params.copyUsersFromStore.db.users.length > 0
          ? (JSON.parse(JSON.stringify(params.copyUsersFromStore.db.users)) as StoredUser[])
          : [];
      if (copiedUsers.length > 0) {
        newStore.db.users = copiedUsers;
      }

      this.enqueueRegistryWrite(async () => {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO projects (id, employer_id, is_default, meta, session_secret, created_at, updated_at)
             VALUES ($1, $2, FALSE, $3::jsonb, $4, $5::timestamptz, NOW())`,
            [info.id, empId, JSON.stringify(info), sessionSecret, info.createdAt],
          );

          for (const u of copiedUsers) {
            const res = await client.query<{ version: number }>(
              `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
               VALUES ($1, 'users', $2, $3::jsonb, 1, NOW(), 'system', NULL)
               ON CONFLICT (project_id, collection_name, record_id) DO UPDATE
                 SET data = EXCLUDED.data, version = project_records.version + 1, updated_at = NOW(), deleted_at = NULL
               RETURNING version`,
              [info.id, u.id, JSON.stringify(u)],
            );
            newStore.applyCommittedSyncUpsert('users', u.id, u, Number(res.rows[0]?.version || 1));
          }
        });
      });
    } else {
      this.saveRegistryDataJson(this.registry);
      if (params.copyUsersFromStore && params.copyUsersFromStore.db.users.length > 0) {
        newStore.db.users = JSON.parse(JSON.stringify(params.copyUsersFromStore.db.users)) as StoredUser[];
        newStore.saveImmediate();
      }
    }

    return info;
  }

  public renameProject(
    id: string,
    params: {
      name?: string;
      code?: string;
      contractRef?: string;
      employerId?: EmployerId;
      employerConfig?: EmployerCustomConfig;
      plantAbbreviation?: string;
      usePlantAbbreviationInDocs?: boolean;
      plantAbbreviationPosition?: PlantAbbreviationPosition;
    },
  ): ProjectInfo | null {
    const clean = sanitizeProjectId(id);
    const target = this.registry.projects.find((p) => p.id === clean);
    if (!target) return null;

    if (params.name !== undefined && normKey(params.name)) {
      target.name = normKey(params.name);
    }
    if (params.code !== undefined) {
      target.code = normKey(params.code) || undefined;
    }
    if (params.contractRef !== undefined) {
      target.contractRef = normKey(params.contractRef) || undefined;
    }
    if (params.employerId !== undefined) {
      const nextEmpId = typeof params.employerId === 'string' ? params.employerId.trim() : '';
      if (nextEmpId && this.listEmployers().some((e) => e.id === nextEmpId)) {
        target.employerId = nextEmpId;
      } else if (!nextEmpId) {
        target.employerId = DEFAULT_EMPLOYER_ID;
      }
    }
    if (params.employerConfig !== undefined) {
      target.employerConfig = sanitizeEmployerConfig(params.employerConfig);
    }
    if (params.plantAbbreviation !== undefined) {
      const cleanAbbr = sanitizePlantAbbreviation(params.plantAbbreviation);
      target.plantAbbreviation = cleanAbbr || undefined;
      if (!cleanAbbr) {
        target.usePlantAbbreviationInDocs = false;
      }
    }
    if (params.usePlantAbbreviationInDocs !== undefined) {
      target.usePlantAbbreviationInDocs = Boolean(
        params.usePlantAbbreviationInDocs && target.plantAbbreviation,
      );
    }
    if (params.plantAbbreviationPosition !== undefined) {
      target.plantAbbreviationPosition =
        params.plantAbbreviationPosition === 'before_number' ? 'before_number' : 'prefix';
    }

    if (this.storageMode === 'postgres') {
      const snapshot = { ...target };
      this.enqueueRegistryWrite(async () => {
        await getPool().query(
          `UPDATE projects
           SET employer_id = $2,
               meta = $3::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [snapshot.id, snapshot.employerId || DEFAULT_EMPLOYER_ID, JSON.stringify(snapshot)],
        );
      });
    } else {
      this.saveRegistryDataJson(this.registry);
    }

    return target;
  }

  public deleteProject(id: string): { ok: boolean; reason?: 'not_found' | 'cannot_delete_default' } {
    const clean = sanitizeProjectId(id);
    const idx = this.registry.projects.findIndex((p) => p.id === clean);
    if (idx === -1) return { ok: false, reason: 'not_found' };
    const target = this.registry.projects[idx];
    if (target.isDefault || isDefaultProjectId(clean)) {
      return { ok: false, reason: 'cannot_delete_default' };
    }

    this.registry.projects.splice(idx, 1);
    this.stores.delete(clean);

    if (this.storageMode === 'postgres') {
      this.enqueueRegistryWrite(async () => {
        await getPool().query(`DELETE FROM projects WHERE id = $1 AND is_default = FALSE`, [clean]);
      });
    } else {
      this.saveRegistryDataJson(this.registry);
      const dbPath = path.join(PROJECTS_DIR, `${clean}.json`);
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      } catch (err) {
        console.error('Failed to delete project DB file:', err);
      }
    }
    return { ok: true };
  }

  // ---------------- EMPLOYER REGISTRY CRUD ----------------
  public listEmployers(): EmployerProfile[] {
    this.registry.employers = ensureDefaultEmployers(this.registry.employers || []);
    return [...this.registry.employers];
  }

  public getEmployer(id: string): EmployerProfile | undefined {
    const clean = (id || '').trim();
    return this.listEmployers().find((e) => e.id === clean);
  }

  public createEmployer(raw: unknown): EmployerProfile | null {
    const id = `emp-${crypto.randomBytes(4).toString('hex')}`;
    const sanitized = sanitizeEmployerProfile({ ...(raw as object), id, isBuiltIn: false });
    if (!sanitized) return null;
    this.registry.employers = ensureDefaultEmployers(this.registry.employers || []);
    this.registry.employers.push(sanitized);

    if (this.storageMode === 'postgres') {
      const snapshot = { ...sanitized };
      this.enqueueRegistryWrite(async () => {
        await getPool().query(
          `INSERT INTO employers (id, is_default, data, created_at, updated_at)
           VALUES ($1, FALSE, $2::jsonb, $3::timestamptz, NOW())`,
          [snapshot.id, JSON.stringify(snapshot), snapshot.createdAt || new Date().toISOString()],
        );
      });
    } else {
      this.saveRegistryDataJson(this.registry);
    }
    return sanitized;
  }

  public updateEmployer(id: string, raw: unknown): EmployerProfile | null {
    const clean = (id || '').trim();
    const list = ensureDefaultEmployers(this.registry.employers || []);
    const idx = list.findIndex((e) => e.id === clean);
    if (idx === -1) return null;
    const prev = list[idx];
    const builtIn = Boolean(prev.isBuiltIn || isBuiltInEmployerId(prev.id));
    const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const merged = builtIn
      ? {
          ...prev,
          uploadedForms:
            rawObj.uploadedForms !== undefined ? rawObj.uploadedForms : prev.uploadedForms,
          id: prev.id,
          isBuiltIn: true,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString(),
        }
      : {
          ...prev,
          ...rawObj,
          id: prev.id,
          isBuiltIn: false,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString(),
        };
    const sanitized = sanitizeEmployerProfile(merged);
    if (!sanitized) return null;
    list[idx] = sanitized;
    this.registry.employers = ensureDefaultEmployers(list);
    const result = this.registry.employers.find((e) => e.id === clean) || sanitized;

    if (this.storageMode === 'postgres') {
      const snapshot = { ...result };
      this.enqueueRegistryWrite(async () => {
        await getPool().query(
          `UPDATE employers
           SET data = $2::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [snapshot.id, JSON.stringify(snapshot)],
        );
      });
    } else {
      this.saveRegistryDataJson(this.registry);
    }
    return result;
  }

  /**
   * Enforces strict 1:N integrity (Safeguard #1):
   * - Built-in employers cannot be deleted.
   * - Employers linked to one or more projects cannot be deleted (`ON DELETE RESTRICT` in PostgreSQL).
   */
  public deleteEmployer(id: string): {
    ok: boolean;
    reason?: 'not_found' | 'cannot_delete_builtin' | 'employer_has_projects';
    projectCount?: number;
  } {
    const clean = (id || '').trim();
    if (isBuiltInEmployerId(clean)) {
      return { ok: false, reason: 'cannot_delete_builtin' };
    }
    const list = ensureDefaultEmployers(this.registry.employers || []);
    const idx = list.findIndex((e) => e.id === clean);
    if (idx === -1) return { ok: false, reason: 'not_found' };
    if (list[idx].isBuiltIn) {
      return { ok: false, reason: 'cannot_delete_builtin' };
    }

    const referencingProjects = this.registry.projects.filter((p) => p.employerId === clean);
    if (referencingProjects.length > 0) {
      return {
        ok: false,
        reason: 'employer_has_projects',
        projectCount: referencingProjects.length,
      };
    }

    list.splice(idx, 1);
    this.registry.employers = list;

    if (this.storageMode === 'postgres') {
      this.enqueueRegistryWrite(async () => {
        await getPool().query(`DELETE FROM employers WHERE id = $1 AND is_default = FALSE`, [clean]);
      });
    } else {
      this.saveRegistryDataJson(this.registry);
    }
    return { ok: true };
  }
}

export const projectManager = new ProjectManager();
export const store = projectManager.getStore('default');
