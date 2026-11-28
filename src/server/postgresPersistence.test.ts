import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { UserAccount } from '../shared/types.ts';
import {
  DEFAULT_SEED_PROJECTS,
  resolveMigrationSqlPath,
  resolveStorageMode,
} from './db.ts';
import {
  extractAttachmentsInRecord,
  isProtectedApiFileUrl,
  isValidImageValue,
  MAX_ATTACHMENT_BYTES,
  resolveSafeUploadFilePath,
  saveBase64Attachment,
} from './fileStorage.ts';
import {
  ALL_PROJECT_COLLECTIONS,
  JSON_MIGRATION_COMPLETED_ID,
  migrateJsonToPostgres,
} from './migrateJsonToPostgres.ts';
import { SamaanStore } from './store.ts';
import {
  executeProjectSync,
  executeProjectSyncResolve,
  SyncValidationError,
} from './syncEngine.ts';
import {
  fetchAuthenticatedMediaBlob,
  isProtectedApiFileUrl as isClientProtectedUrl,
} from '../lib/authMedia.ts';

// Minimal valid 1x1 PNG binary
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const SAMPLE_PNG_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;
const SAMPLE_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'ascii').toString('base64');
const SAMPLE_PDF_DATA_URL = `data:application/pdf;base64,${SAMPLE_PDF_BASE64}`;

const ADMIN_ACTOR: UserAccount = {
  id: 'u-admin',
  username: 'admin',
  fullName: 'مدیر کل تست',
  role: 'admin',
  active: true,
  preferences: {
    language: 'fa',
    calendar: 'jalali',
    theme: 'light',
    eyeComfort: false,
    spellCheck: true,
  },
  createdAt: '2026-06-01T00:00:00.000Z',
};

const OPERATOR_ACTOR: UserAccount = {
  ...ADMIN_ACTOR,
  id: 'u-op',
  username: 'operator1',
  fullName: 'اپراتور انبار',
  role: 'operator',
};

interface FakeRecordRow {
  project_id: string;
  collection_name: string;
  record_id: string;
  data: unknown;
  version: number;
  updated_by: string | null;
  deleted_at: string | null;
}

interface FakeGlobalLogRow {
  id: string;
  log_type: string;
  payload: unknown;
  created_at: string;
}

/**
 * In-memory PostgreSQL query simulator supporting transactions, ON CONFLICT upserts,
 * version increments, soft deletes, rollback on error, and strict 1:N employer->project FK checks.
 */
class FakePostgresPool {
  public employers = new Map<string, { id: string; is_default: boolean; data: unknown }>();
  public projects = new Map<
    string,
    { id: string; employer_id: string; is_default: boolean; meta: unknown; session_secret: string }
  >();
  public records = new Map<string, FakeRecordRow>();
  public globalLogs = new Map<string, FakeGlobalLogRow>();
  public failNextRecordWrite = false;

  private makeKey(projectId: string, collectionName: string, recordId: string): string {
    return `${projectId}|${collectionName}|${recordId}`;
  }

  public asPool(): Pool {
    return this as unknown as Pool;
  }

  public async connect(): Promise<PoolClient> {
    let txSnapshot: {
      employers: Map<string, { id: string; is_default: boolean; data: unknown }>;
      projects: Map<
        string,
        { id: string; employer_id: string; is_default: boolean; meta: unknown; session_secret: string }
      >;
      records: Map<string, FakeRecordRow>;
      globalLogs: Map<string, FakeGlobalLogRow>;
    } | null = null;

    const client = {
      query: async (sql: string, params?: unknown[]) => {
        const trimmed = sql.trim().toUpperCase();
        if (trimmed === 'BEGIN') {
          txSnapshot = {
            employers: new Map(JSON.parse(JSON.stringify(Array.from(this.employers.entries())))),
            projects: new Map(JSON.parse(JSON.stringify(Array.from(this.projects.entries())))),
            records: new Map(JSON.parse(JSON.stringify(Array.from(this.records.entries())))),
            globalLogs: new Map(JSON.parse(JSON.stringify(Array.from(this.globalLogs.entries())))),
          };
          return { rows: [], rowCount: 0 } as unknown as QueryResult;
        }
        if (trimmed === 'COMMIT') {
          txSnapshot = null;
          return { rows: [], rowCount: 0 } as unknown as QueryResult;
        }
        if (trimmed === 'ROLLBACK') {
          if (txSnapshot) {
            this.employers = txSnapshot.employers;
            this.projects = txSnapshot.projects;
            this.records = txSnapshot.records;
            this.globalLogs = txSnapshot.globalLogs;
            txSnapshot = null;
          }
          return { rows: [], rowCount: 0 } as unknown as QueryResult;
        }
        return this.query(sql, params);
      },
      release: () => {},
    };
    return client as unknown as PoolClient;
  }

  public async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (/^SELECT payload FROM global_logs WHERE id = \$1 AND log_type = \$2/i.test(q)) {
      const [id, logType] = params as [string, string];
      const row = this.globalLogs.get(id);
      if (row && row.log_type === logType) {
        return { rows: [{ payload: row.payload }], rowCount: 1 } as unknown as QueryResult;
      }
      return { rows: [], rowCount: 0 } as unknown as QueryResult;
    }

    if (/^SELECT 1 AS exists_flag FROM project_records LIMIT 1/i.test(q)) {
      const hasAny = this.records.size > 0;
      return {
        rows: hasAny ? [{ exists_flag: 1 }] : [],
        rowCount: hasAny ? 1 : 0,
      } as unknown as QueryResult;
    }

    if (/^SELECT id FROM employers/i.test(q)) {
      return {
        rows: Array.from(this.employers.keys()).map((id) => ({ id })),
        rowCount: this.employers.size,
      } as unknown as QueryResult;
    }

    if (/^INSERT INTO global_logs/i.test(q)) {
      const id = String(params[0]);
      const isSystemMeta = /VALUES \(\$1, 'system_meta'/i.test(q);
      const logType = isSystemMeta ? 'system_meta' : String(params[1]);
      const payloadRaw = isSystemMeta ? params[1] : params[2];
      const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;
      const exists = this.globalLogs.has(id);
      if (exists && /ON CONFLICT \(id\) DO NOTHING/i.test(q)) {
        return { rows: [], rowCount: 0 } as unknown as QueryResult;
      }
      this.globalLogs.set(id, {
        id,
        log_type: logType,
        payload,
        created_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 } as unknown as QueryResult;
    }

    if (/^INSERT INTO employers/i.test(q)) {
      const [id, isDef, dataStr] = params as [string, boolean, string];
      const data = JSON.parse(dataStr);
      const exists = this.employers.has(id);
      this.employers.set(id, { id, is_default: Boolean(isDef), data });
      return { rows: [], rowCount: exists ? 0 : 1 } as unknown as QueryResult;
    }

    if (/^INSERT INTO projects/i.test(q)) {
      const [id, employerId, isDef, metaStr, secret] = params as [
        string,
        string,
        boolean,
        string,
        string,
      ];
      if (!this.employers.has(employerId)) {
        throw new Error(`FK violation: employer "${employerId}" does not exist`);
      }
      const exists = this.projects.has(id);
      this.projects.set(id, {
        id,
        employer_id: employerId,
        is_default: Boolean(isDef),
        meta: JSON.parse(metaStr),
        session_secret: secret,
      });
      return { rows: [], rowCount: exists ? 0 : 1 } as unknown as QueryResult;
    }

    if (/^SELECT data, version, deleted_at FROM project_records WHERE project_id = \$1 AND collection_name = \$2 AND record_id = \$3/i.test(q)) {
      const [projectId, col, recId] = params as [string, string, string];
      const row = this.records.get(this.makeKey(projectId, col, recId));
      return {
        rows: row ? [{ data: row.data, version: row.version, deleted_at: row.deleted_at }] : [],
        rowCount: row ? 1 : 0,
      } as unknown as QueryResult;
    }

    if (/^INSERT INTO project_records/i.test(q)) {
      if (this.failNextRecordWrite) {
        this.failNextRecordWrite = false;
        throw new Error('Simulated PostgreSQL write failure');
      }
      // Handle both auditLogs inline literal and parameterized collection_name
      const isAuditLiteral = /VALUES \(\$1, 'auditLogs'/i.test(q);
      const isDeletedTombstone = /'\{\}'::jsonb, 1, NOW\(\), \$4, NOW\(\)/i.test(q);

      const projectId = String(params[0]);
      const col = isAuditLiteral ? 'auditLogs' : String(params[1]);
      const recId = isAuditLiteral ? String(params[1]) : String(params[2]);
      const dataStr = isDeletedTombstone
        ? '{}'
        : isAuditLiteral
          ? String(params[2])
          : String(params[3]);
      const actor = isDeletedTombstone
        ? String(params[3])
        : isAuditLiteral
          ? String(params[3])
          : String(params[4] || 'json_migration');

      const key = this.makeKey(projectId, col, recId);
      const prev = this.records.get(key);
      if (prev && /ON CONFLICT .* DO NOTHING/i.test(q)) {
        return { rows: [], rowCount: 0 } as unknown as QueryResult;
      }

      const nextVersion = prev ? prev.version + 1 : 1;
      this.records.set(key, {
        project_id: projectId,
        collection_name: col,
        record_id: recId,
        data: JSON.parse(dataStr),
        version: nextVersion,
        updated_by: actor,
        deleted_at: isDeletedTombstone ? new Date().toISOString() : null,
      });
      return { rows: [{ version: nextVersion }], rowCount: 1 } as unknown as QueryResult;
    }

    if (/^UPDATE project_records SET deleted_at = NOW\(\)/i.test(q)) {
      const [projectId, col, recId, actor] = params as [string, string, string, string];
      const key = this.makeKey(projectId, col, recId);
      const prev = this.records.get(key);
      if (!prev) {
        return { rows: [], rowCount: 0 } as unknown as QueryResult;
      }
      if (/AND deleted_at IS NULL/i.test(q) && prev.deleted_at) {
        return { rows: [], rowCount: 0 } as unknown as QueryResult;
      }
      prev.deleted_at = new Date().toISOString();
      prev.version += 1;
      prev.updated_by = actor;
      return { rows: [{ version: prev.version }], rowCount: 1 } as unknown as QueryResult;
    }

    throw new Error(`Unhandled SQL in FakePostgresPool: ${q}`);
  }
}

test('001_init.sql enforces strict 1:N employers -> projects FK (ON DELETE RESTRICT, non-unique, indexed) and all required tables', () => {
  const sql = fs.readFileSync(resolveMigrationSqlPath(), 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS employers/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS projects/i);
  assert.match(
    sql,
    /employer_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+employers\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
  const sqlNoComments = sql.replace(/--[^\n]*/g, '');
  // Ensure projects.employer_id is NEVER declared UNIQUE (must allow unlimited 1:N projects per employer)
  assert.doesNotMatch(sqlNoComments, /employer_id[^,\n]*\bUNIQUE\b/i);
  assert.match(sqlNoComments, /CREATE INDEX IF NOT EXISTS idx_projects_employer_id\s+ON projects\s*\(employer_id\)/i);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_records/i);
  assert.match(sql, /PRIMARY KEY\s*\(project_id,\s*collection_name,\s*record_id\)/i);
  assert.match(sql, /ON project_records\s*\(project_id,\s*collection_name\)/i);
  assert.match(sql, /ON project_records\s*\(updated_at\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS global_logs/i);

  // Verify 3 default seeded projects (1 per built-in MAPNA employer MD1, MD2, MD3)
  assert.equal(DEFAULT_SEED_PROJECTS.length, 3);
  assert.deepEqual(
    DEFAULT_SEED_PROJECTS.map((p) => p.employerId),
    ['mapna-md1', 'mapna-md2', 'mapna-md3'],
  );
  assert.equal(ALL_PROJECT_COLLECTIONS.length, 19);
});

test('resolveStorageMode respects SAMAAN_STORAGE_MODE and DATABASE_URL defaults', () => {
  assert.equal(resolveStorageMode({}), 'json');
  assert.equal(resolveStorageMode({ DATABASE_URL: 'postgres://u:p@localhost:5432/samaan' }), 'postgres');
  assert.equal(
    resolveStorageMode({
      SAMAAN_STORAGE_MODE: 'json',
      DATABASE_URL: 'postgres://u:p@localhost:5432/samaan',
    }),
    'json',
  );
  assert.throws(
    () => resolveStorageMode({ SAMAAN_STORAGE_MODE: 'postgres' }),
    /DATABASE_URL is empty/,
  );
});

test('fileStorage extracts inline image/PDF data URLs and signedScan.dataBase64, enforces MIME/10MB limits, and blocks path traversal', () => {
  const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'samaan-uploads-test-'));
  try {
    const sampleRecord = {
      id: 'rec-1',
      itemImage: SAMPLE_PNG_DATA_URL,
      itemImages: [SAMPLE_PNG_DATA_URL],
      signedScan: {
        fileName: 'signed-opi.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 40,
        dataBase64: SAMPLE_PDF_BASE64,
        uploadedAt: '2026-06-01T00:00:00.000Z',
      },
    };

    const extracted = extractAttachmentsInRecord('default', sampleRecord, {
      uploadsRootDir: tmpUploads,
    });
    assert.equal(extracted.extractedCount, 3);
    assert.equal(isProtectedApiFileUrl(sampleRecord.itemImage), true);
    assert.equal(isValidImageValue(sampleRecord.itemImage), true);
    assert.equal(isProtectedApiFileUrl(sampleRecord.itemImages[0]), true);
    assert.equal(isProtectedApiFileUrl(sampleRecord.signedScan.dataBase64), true);
    assert.match(sampleRecord.signedScan.dataBase64, /^\/api\/files\/default\/[0-9a-f-]+\.pdf$/i);

    // Re-running extraction on already-extracted URLs is a no-op
    const secondPass = extractAttachmentsInRecord('default', sampleRecord, {
      uploadsRootDir: tmpUploads,
    });
    assert.equal(secondPass.extractedCount, 0);

    // Resolve saved file safely
    const pngFilename = path.basename(sampleRecord.itemImage);
    const resolved = resolveSafeUploadFilePath('default', pngFilename, tmpUploads);
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.mimeType, 'image/png');
      assert.equal(fs.existsSync(resolved.diskPath), true);
    }

    // Path traversal attempts must be blocked
    const traversal1 = resolveSafeUploadFilePath('default', '../secret.json', tmpUploads);
    assert.equal(traversal1.ok, false);
    const traversal2 = resolveSafeUploadFilePath('../etc', pngFilename, tmpUploads);
    assert.equal(traversal2.ok, false);
    const traversal3 = resolveSafeUploadFilePath('default', 'not-a-uuid.png', tmpUploads);
    assert.equal(traversal3.ok, false);

    // Unsupported MIME type rejected
    assert.throws(
      () =>
        saveBase64Attachment({
          projectId: 'default',
          base64OrDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          uploadsRootDir: tmpUploads,
        }),
      /Unsupported attachment MIME type/,
    );

    // Spoofed magic bytes rejected
    assert.throws(
      () =>
        saveBase64Attachment({
          projectId: 'default',
          base64OrDataUrl: `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`,
          uploadsRootDir: tmpUploads,
        }),
      /binary signature does not match/,
    );

    // Oversized (>10MB) rejected
    const oversizedBase64 = Buffer.alloc(MAX_ATTACHMENT_BYTES + 16, 0x41).toString('base64');
    assert.throws(
      () =>
        saveBase64Attachment({
          projectId: 'default',
          base64OrDataUrl: `data:application/pdf;base64,${oversizedBase64}`,
          uploadsRootDir: tmpUploads,
        }),
      /exceeds maximum allowed size/,
    );
  } finally {
    fs.rmSync(tmpUploads, { recursive: true, force: true });
  }
});

test('migrateJsonToPostgres imports legacy data once, sets json_migration_completed, and NEVER re-imports after records are cleared', async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'samaan-data-test-'));
  const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'samaan-mig-uploads-'));
  try {
    // Prepare fake legacy JSON files
    fs.writeFileSync(
      path.join(tmpData, 'samaan-projects.json'),
      JSON.stringify({
        authSecret: 'a'.repeat(64),
        employers: [],
        projects: [
          {
            id: 'default',
            name: 'پروژه اصلی',
            employerId: 'mapna-md1',
            isDefault: true,
            createdAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpData, 'samaan-db.json'),
      JSON.stringify({
        version: 2,
        sessionSecret: 'b'.repeat(64),
        users: [{ id: 'u1', username: 'admin', role: 'admin', active: true }],
        general: [
          {
            id: 'gen-1',
            rowNo: '1',
            packingListNo: 'PL-100',
            itemImages: [SAMPLE_PNG_DATA_URL],
          },
        ],
        detailed: [],
        transit: [],
        packingMeta: { 'PL-100': { packingNo: 'PL-100', notes: 'ok' } },
        categories: { island: ['GT'], system: [] },
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
      }),
    );
    fs.writeFileSync(
      path.join(tmpData, 'samaan-error-reports.json'),
      JSON.stringify([
        {
          id: 'err-1',
          title: 'Test Error',
          description: 'Something failed',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );

    const fakePool = new FakePostgresPool();
    fakePool.employers.set('mapna-md1', { id: 'mapna-md1', is_default: true, data: {} });

    const firstRun = await migrateJsonToPostgres({
      pool: fakePool.asPool(),
      dataDir: tmpData,
      uploadsRootDir: tmpUploads,
    });

    assert.equal(firstRun.skipped, false);
    assert.equal(firstRun.projectsImported, 1);
    assert.equal(firstRun.recordsImported, 4); // users + general + packingMeta + categories
    assert.equal(firstRun.attachmentsExtracted, 1);
    assert.equal(firstRun.globalLogsImported, 1);

    // Verify permanent flag stored in global_logs
    const flag = fakePool.globalLogs.get(JSON_MIGRATION_COMPLETED_ID);
    assert.ok(flag);
    assert.equal((flag.payload as { completed?: boolean }).completed, true);

    // Simulate admin purging ALL project_records later
    fakePool.records.clear();

    // Re-running migration on next boot MUST skip because `json_migration_completed` is set
    const secondRun = await migrateJsonToPostgres({
      pool: fakePool.asPool(),
      dataDir: tmpData,
      uploadsRootDir: tmpUploads,
    });
    assert.equal(secondRun.skipped, true);
    assert.equal(secondRun.reason, 'already_completed');
    assert.equal(fakePool.records.size, 0);
  } finally {
    fs.rmSync(tmpData, { recursive: true, force: true });
    fs.rmSync(tmpUploads, { recursive: true, force: true });
  }
});

test('SamaanStore in postgres mode awaits commit, keeps recordVersions strictly synchronized, and surfaces DB errors', async () => {
  const fakePool = new FakePostgresPool();
  const store = new SamaanStore('/tmp/unused-pg-store.json', {
    projectId: 'default',
    storageMode: 'postgres',
    skipDiskLoad: true,
    pool: fakePool.asPool(),
  });

  store.db.general.push({
    id: 'g-1',
    rowNo: '1',
    packingListNo: 'PL-200',
    packageNo: '1',
    arrivalDate: '2026-06-01',
    supplier: 'MAPNA',
    dispatchLocation: 'Tehran',
    island: 'GT',
    system: 'SYS1',
    subSystem: 'SUB1',
    unit: 'U1',
    packageType: 'Box',
    description: 'Turbine Valve',
    remarks: '',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  } as unknown as (typeof store.db.general)[number]);

  store.saveImmediate('admin');
  await store.awaitFlush();

  assert.equal(store.getRecordVersion('general', 'g-1'), 1);
  assert.equal(fakePool.records.get('default|general|g-1')?.version, 1);

  // Update the same record and confirm version increments to 2 in both DB and store
  store.db.general[0].supplier = 'MAPNA-UPDATED';
  store.saveImmediate('admin');
  await store.awaitFlush();

  assert.equal(store.getRecordVersion('general', 'g-1'), 2);
  assert.equal(fakePool.records.get('default|general|g-1')?.version, 2);

  // Simulate DB write failure and confirm awaitFlush rejects instead of returning 200 silently
  fakePool.failNextRecordWrite = true;
  store.db.general[0].supplier = 'MAPNA-FAIL';
  store.saveImmediate('admin');
  await assert.rejects(() => store.awaitFlush(), /Simulated PostgreSQL write failure/);
});

test('executeProjectSync applies non-conflicting mutations atomically, preserves conflicting server records, and executeProjectSyncResolve commits resolutions with audit log', async () => {
  const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'samaan-sync-uploads-'));
  try {
    const fakePool = new FakePostgresPool();
    // Pre-populate server with record g-conflict at version 3
    fakePool.records.set('default|general|g-conflict', {
      project_id: 'default',
      collection_name: 'general',
      record_id: 'g-conflict',
      data: { id: 'g-conflict', packingListNo: 'PL-SERVER', description: 'Server Truth' },
      version: 3,
      updated_by: 'admin',
      deleted_at: null,
    });

    const store = new SamaanStore('/tmp/unused-sync-store.json', {
      projectId: 'default',
      storageMode: 'postgres',
      skipDiskLoad: true,
      pool: fakePool.asPool(),
    });
    store.hydrateFromPostgresRows(
      [
        {
          collection_name: 'general',
          record_id: 'g-conflict',
          data: { id: 'g-conflict', packingListNo: 'PL-SERVER', description: 'Server Truth' },
          version: 3,
          deleted_at: null,
        },
      ],
      'secret',
    );

    // Operator cannot sync `users` collection
    await assert.rejects(
      () =>
        executeProjectSync({
          projectId: 'default',
          targetStore: store,
          actorUser: OPERATOR_ACTOR,
          poolOverride: fakePool.asPool(),
          uploadsRootDir: tmpUploads,
          mutations: [
            {
              collection: 'users',
              recordId: 'u-hack',
              action: 'upsert',
              baseVersion: 0,
              data: { id: 'u-hack', role: 'admin' },
            },
          ],
        }),
      (err: unknown) => err instanceof SyncValidationError && err.status === 403,
    );

    // Mixed batch: 1 clean insert (with Base64 photo) + 1 stale update conflict (baseVersion=1 vs serverVersion=3)
    const syncRes = await executeProjectSync({
      projectId: 'default',
      targetStore: store,
      actorUser: ADMIN_ACTOR,
      poolOverride: fakePool.asPool(),
      uploadsRootDir: tmpUploads,
      mutations: [
        {
          collection: 'general',
          recordId: 'g-new',
          action: 'upsert',
          baseVersion: 0,
          data: {
            id: 'g-new',
            packingListNo: 'PL-NEW',
            description: 'Offline Created Package',
            itemImages: [SAMPLE_PNG_DATA_URL],
          },
        },
        {
          collection: 'general',
          recordId: 'g-conflict',
          action: 'upsert',
          baseVersion: 1,
          data: {
            id: 'g-conflict',
            packingListNo: 'PL-CLIENT',
            description: 'Stale Client Edit',
          },
        },
      ],
    });

    assert.equal(syncRes.ok, false);
    assert.equal(syncRes.applied.length, 1);
    assert.equal(syncRes.applied[0].recordId, 'g-new');
    assert.equal(syncRes.applied[0].version, 1);
    const appliedData = syncRes.applied[0].data as { itemImages: string[] };
    assert.equal(isProtectedApiFileUrl(appliedData.itemImages[0]), true);

    assert.equal(syncRes.conflicts.length, 1);
    assert.equal(syncRes.conflicts[0].recordId, 'g-conflict');
    assert.equal(syncRes.conflicts[0].serverVersion, 3);
    assert.equal(syncRes.conflicts[0].clientVersion, 1);
    assert.deepEqual(syncRes.conflicts[0].serverData, {
      id: 'g-conflict',
      packingListNo: 'PL-SERVER',
      description: 'Server Truth',
    });

    // Server record must remain untouched at version 3
    assert.equal(fakePool.records.get('default|general|g-conflict')?.version, 3);
    assert.equal(store.getRecordVersion('general', 'g-new'), 1);
    assert.equal(store.getRecordVersion('general', 'g-conflict'), 3);

    // Resolve conflict atomically with `use_merged` and verify version increments to 4 + audit log written
    const resolveRes = await executeProjectSyncResolve({
      projectId: 'default',
      targetStore: store,
      actorUser: ADMIN_ACTOR,
      poolOverride: fakePool.asPool(),
      uploadsRootDir: tmpUploads,
      resolutions: [
        {
          collection: 'general',
          recordId: 'g-conflict',
          choice: 'use_merged',
          expectedServerVersion: 3,
          data: {
            id: 'g-conflict',
            packingListNo: 'PL-MERGED',
            description: 'Merged Server + Client',
          },
        },
      ],
    });

    assert.equal(resolveRes.ok, true);
    assert.equal(resolveRes.resolved.length, 1);
    assert.equal(resolveRes.resolved[0].version, 4);
    assert.equal(store.getRecordVersion('general', 'g-conflict'), 4);
    assert.equal(fakePool.records.get('default|general|g-conflict')?.version, 4);
    assert.ok(fakePool.records.has(`default|auditLogs|${resolveRes.auditEntryId}`));
    assert.ok(store.db.auditLogs.some((a) => a.id === resolveRes.auditEntryId));
  } finally {
    fs.rmSync(tmpUploads, { recursive: true, force: true });
  }
});

test('authMedia validates protected file URLs and sends credentials + X-Samaan-Project header', async () => {
  const validUrl = '/api/files/default/11111111-2222-3333-4444-555555555555.pdf';
  assert.equal(isClientProtectedUrl(validUrl), true);
  assert.equal(isClientProtectedUrl('https://evil.example/api/files/default/x.png'), false);
  assert.equal(isClientProtectedUrl('/api/files/default/../etc/passwd'), false);

  let capturedInit: RequestInit | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    capturedInit = init;
    return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  };

  const blob = await fetchAuthenticatedMediaBlob(validUrl, {
    mimeTypeHint: 'application/pdf',
    fetchImpl: fakeFetch,
  });

  assert.equal(capturedInit?.credentials, 'same-origin');
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers['X-Samaan-Project'], 'default');
  assert.equal(blob.type, 'application/pdf');
  assert.equal(blob.size, 5);
});
