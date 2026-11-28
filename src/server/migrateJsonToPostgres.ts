import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import {
  DEFAULT_EMPLOYER_ID,
  isBuiltInEmployerId,
  sanitizeEmployerProfile,
} from '../shared/employers.ts';
import type { EmployerProfile, ProjectInfo } from '../shared/types.ts';
import {
  closePool,
  getGlobalLogById,
  getPool,
  isDefaultProjectId,
  runMigrations,
  seedDefaultEmployersAndProjects,
  withTransaction,
  type GlobalLogType,
} from './db.ts';
import { extractAttachmentsInRecord } from './fileStorage.ts';

/**
 * All 19 canonical project-scoped collections preserved with 100% compatibility.
 */
export const ALL_PROJECT_COLLECTIONS = [
  'users',
  'general',
  'detailed',
  'transit',
  'packingMeta',
  'categories',
  'auditLogs',
  'trash',
  'opiInvitations',
  'siteEntryMinutes',
  'opiMinutes',
  'osdrReports',
  'substitutions',
  'gcvDocuments',
  'mivDocuments',
  'bmrDocuments',
  'materialEstimates',
  'periodicInspections',
  'customFormSubmissions',
] as const;

export type ProjectCollectionName = (typeof ALL_PROJECT_COLLECTIONS)[number];

export const JSON_MIGRATION_COMPLETED_ID = 'json_migration_completed';
const AUTH_SECRET_LOG_ID = 'samaan_auth_secret';

export interface JsonMigrationResult {
  skipped: boolean;
  reason?: 'already_completed' | 'database_not_empty' | 'no_legacy_files';
  employersImported: number;
  projectsImported: number;
  recordsImported: number;
  attachmentsExtracted: number;
  globalLogsImported: number;
}

interface LegacyProjectRegistry {
  authSecret?: string;
  projects?: ProjectInfo[];
  employers?: EmployerProfile[];
}

function sanitizeProjectId(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function safeReadJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[migrateJsonToPostgres] Failed to read JSON file "${filePath}":`, err);
    return null;
  }
}

/**
 * One-time idempotent migration helper that safely imports any existing `data/*.json` files
 * (registry, employers, projects, all 19 collections per project, and global logs) into PostgreSQL,
 * extracting inline Base64 images/PDFs to disk along the way.
 *
 * Safeguard #2:
 * Stores a permanent `json_migration_completed` flag in `global_logs` (`system_meta`) so legacy JSON
 * files are NEVER re-imported on later boots even if project records are subsequently cleared/purged.
 */
export async function migrateJsonToPostgres(options?: {
  pool?: Pool;
  dataDir?: string;
  uploadsRootDir?: string;
  force?: boolean;
}): Promise<JsonMigrationResult> {
  const pool = options?.pool || getPool();
  const dataDir = path.resolve(options?.dataDir || path.join(process.cwd(), 'data'));
  const uploadsRootDir = options?.uploadsRootDir;

  // 1. Check permanent completion flag in global_logs
  if (!options?.force) {
    const existingFlag = await getGlobalLogById<{ completed?: boolean }>(
      JSON_MIGRATION_COMPLETED_ID,
      'system_meta',
      pool,
    );
    if (existingFlag?.completed) {
      return {
        skipped: true,
        reason: 'already_completed',
        employersImported: 0,
        projectsImported: 0,
        recordsImported: 0,
        attachmentsExtracted: 0,
        globalLogsImported: 0,
      };
    }

    // 2. If PostgreSQL already contains project records, record completion flag and skip auto-import
    const existingCountRes = await pool.query<{ exists_flag: number }>(
      `SELECT 1 AS exists_flag FROM project_records LIMIT 1`,
    );
    if (existingCountRes.rows.length > 0) {
      await pool.query(
        `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
         VALUES ($1, 'system_meta', $2::jsonb, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          JSON_MIGRATION_COMPLETED_ID,
          JSON.stringify({
            completed: true,
            completedAt: new Date().toISOString(),
            reason: 'database_not_empty',
          }),
        ],
      );
      return {
        skipped: true,
        reason: 'database_not_empty',
        employersImported: 0,
        projectsImported: 0,
        recordsImported: 0,
        attachmentsExtracted: 0,
        globalLogsImported: 0,
      };
    }
  }

  const registryFile = path.join(dataDir, 'samaan-projects.json');
  const defaultDbFile = path.join(dataDir, 'samaan-db.json');
  const projectsDir = path.join(dataDir, 'projects');
  const legacyGlobalFiles: Array<{ file: string; logType: GlobalLogType }> = [
    { file: path.join(dataDir, 'samaan-error-reports.json'), logType: 'error_report' },
    { file: path.join(dataDir, 'samaan-employer-requests.json'), logType: 'employer_request' },
    { file: path.join(dataDir, 'samaan-developer-outbox.json'), logType: 'developer_outbox' },
  ];

  const hasAnyLegacyFile =
    fs.existsSync(registryFile) ||
    fs.existsSync(defaultDbFile) ||
    (fs.existsSync(projectsDir) &&
      fs.readdirSync(projectsDir).some((f) => f.toLowerCase().endsWith('.json'))) ||
    legacyGlobalFiles.some((g) => fs.existsSync(g.file));

  if (!hasAnyLegacyFile) {
    await pool.query(
      `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
       VALUES ($1, 'system_meta', $2::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload,
             updated_at = NOW()`,
      [
        JSON_MIGRATION_COMPLETED_ID,
        JSON.stringify({
          completed: true,
          completedAt: new Date().toISOString(),
          reason: 'no_legacy_files',
        }),
      ],
    );
    return {
      skipped: true,
      reason: 'no_legacy_files',
      employersImported: 0,
      projectsImported: 0,
      recordsImported: 0,
      attachmentsExtracted: 0,
      globalLogsImported: 0,
    };
  }

  const summary: JsonMigrationResult = {
    skipped: false,
    employersImported: 0,
    projectsImported: 0,
    recordsImported: 0,
    attachmentsExtracted: 0,
    globalLogsImported: 0,
  };

  await withTransaction(async (client) => {
    const registry = safeReadJsonFile<LegacyProjectRegistry>(registryFile);
    const validEmployerIds = new Set<string>();

    // Load already-seeded employer IDs (built-ins + any existing)
    const seededEmps = await client.query<{ id: string }>(`SELECT id FROM employers`);
    for (const row of seededEmps.rows) {
      validEmployerIds.add(row.id);
    }

    // Preserve legacy cluster authSecret so existing sessions remain valid after cutover
    if (registry?.authSecret && typeof registry.authSecret === 'string' && registry.authSecret.trim().length >= 32) {
      await client.query(
        `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
         VALUES ($1, 'system_meta', $2::jsonb, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [AUTH_SECRET_LOG_ID, JSON.stringify({ authSecret: registry.authSecret.trim() })],
      );
    }

    // 3. Import employers (custom employers + uploadedForms on built-ins)
    if (Array.isArray(registry?.employers)) {
      for (const rawEmp of registry.employers) {
        const sanitized = sanitizeEmployerProfile(rawEmp);
        if (!sanitized) continue;
        const isDef = Boolean(sanitized.isBuiltIn || isBuiltInEmployerId(sanitized.id));
        const res = await client.query(
          `INSERT INTO employers (id, is_default, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
           ON CONFLICT (id) DO UPDATE
             SET data = CASE
               WHEN employers.is_default THEN jsonb_set(employers.data, '{uploadedForms}', COALESCE(EXCLUDED.data->'uploadedForms', '[]'::jsonb), true)
               ELSE employers.data
             END,
             updated_at = NOW()`,
          [
            sanitized.id,
            isDef,
            JSON.stringify(sanitized),
            sanitized.createdAt || new Date().toISOString(),
            sanitized.updatedAt || new Date().toISOString(),
          ],
        );
        validEmployerIds.add(sanitized.id);
        if ((res.rowCount || 0) > 0 && !isDef) {
          summary.employersImported += 1;
        }
      }
    }

    // 4. Collect all projects from registry + any standalone `data/projects/*.json` files
    const projectsToImport = new Map<string, { info: ProjectInfo; dbPath: string }>();

    if (Array.isArray(registry?.projects)) {
      for (const p of registry.projects) {
        const cleanId = sanitizeProjectId(p?.id || '');
        if (!cleanId) continue;
        const empId =
          typeof p.employerId === 'string' && validEmployerIds.has(p.employerId.trim())
            ? p.employerId.trim()
            : DEFAULT_EMPLOYER_ID;
        const dbPath =
          cleanId === 'default' ? defaultDbFile : path.join(projectsDir, `${cleanId}.json`);
        projectsToImport.set(cleanId, {
          info: {
            ...p,
            id: cleanId,
            name: String(p.name || cleanId).trim(),
            employerId: empId,
            isDefault: Boolean(p.isDefault || isDefaultProjectId(cleanId)),
            createdAt: p.createdAt || new Date().toISOString(),
          },
          dbPath,
        });
      }
    }

    if (fs.existsSync(defaultDbFile) && !projectsToImport.has('default')) {
      projectsToImport.set('default', {
        info: {
          id: 'default',
          name: 'پروژه پیش‌فرض مپنا توسعه یک (MD1)',
          code: 'MD1-DEFAULT',
          employerId: DEFAULT_EMPLOYER_ID,
          isDefault: true,
          createdAt: new Date().toISOString(),
        },
        dbPath: defaultDbFile,
      });
    }

    if (fs.existsSync(projectsDir)) {
      for (const fileName of fs.readdirSync(projectsDir)) {
        if (!fileName.toLowerCase().endsWith('.json')) continue;
        const rawId = fileName.slice(0, -5);
        const cleanId = sanitizeProjectId(rawId);
        if (!cleanId || projectsToImport.has(cleanId)) continue;
        projectsToImport.set(cleanId, {
          info: {
            id: cleanId,
            name: cleanId,
            employerId: DEFAULT_EMPLOYER_ID,
            isDefault: isDefaultProjectId(cleanId),
            createdAt: new Date().toISOString(),
          },
          dbPath: path.join(projectsDir, fileName),
        });
      }
    }

    // 5. Upsert projects and migrate all 19 collections per project
    for (const [projectId, entry] of projectsToImport.entries()) {
      const legacyDb = safeReadJsonFile<Record<string, unknown>>(entry.dbPath);
      const sessionSecret =
        legacyDb && typeof legacyDb.sessionSecret === 'string' && legacyDb.sessionSecret.trim()
          ? legacyDb.sessionSecret.trim()
          : crypto.randomBytes(32).toString('hex');

      const projRes = await client.query(
        `INSERT INTO projects (id, employer_id, is_default, meta, session_secret, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, NOW())
         ON CONFLICT (id) DO UPDATE
           SET meta = CASE
                 WHEN projects.is_default AND EXCLUDED.meta->>'name' IS NOT NULL THEN EXCLUDED.meta
                 ELSE projects.meta
               END,
               session_secret = EXCLUDED.session_secret,
               updated_at = NOW()`,
        [
          projectId,
          entry.info.employerId || DEFAULT_EMPLOYER_ID,
          Boolean(entry.info.isDefault || isDefaultProjectId(projectId)),
          JSON.stringify(entry.info),
          sessionSecret,
          entry.info.createdAt || new Date().toISOString(),
        ],
      );
      if ((projRes.rowCount || 0) > 0) {
        summary.projectsImported += 1;
      }

      if (!legacyDb) continue;

      const upsertRecord = async (
        collectionName: ProjectCollectionName,
        recordId: string,
        rawValue: unknown,
      ) => {
        const cloned = JSON.parse(JSON.stringify(rawValue));
        if (cloned && typeof cloned === 'object') {
          const extRes = extractAttachmentsInRecord(projectId, cloned, {
            uploadsRootDir,
            onError: (err, fieldPath) => {
              console.warn(
                `[migrateJsonToPostgres] Skipped invalid attachment at ${projectId}/${collectionName}/${recordId}.${fieldPath}:`,
                err.message,
              );
            },
          });
          summary.attachmentsExtracted += extRes.extractedCount;
        }
        const recRes = await client.query(
          `INSERT INTO project_records (project_id, collection_name, record_id, data, version, updated_at, updated_by, deleted_at)
           VALUES ($1, $2, $3, $4::jsonb, 1, NOW(), 'json_migration', NULL)
           ON CONFLICT (project_id, collection_name, record_id) DO NOTHING`,
          [projectId, collectionName, recordId, JSON.stringify(cloned)],
        );
        if ((recRes.rowCount || 0) > 0) {
          summary.recordsImported += 1;
        }
      };

      for (const collectionName of ALL_PROJECT_COLLECTIONS) {
        const rawCol = legacyDb[collectionName];
        if (collectionName === 'categories') {
          if (rawCol && typeof rawCol === 'object' && !Array.isArray(rawCol)) {
            await upsertRecord('categories', 'singleton', rawCol);
          }
          continue;
        }

        if (collectionName === 'packingMeta') {
          if (rawCol && typeof rawCol === 'object' && !Array.isArray(rawCol)) {
            const metaObj = rawCol as Record<string, unknown>;
            for (const packingKey of Object.keys(metaObj)) {
              const cleanKey = packingKey.trim();
              if (!cleanKey) continue;
              await upsertRecord('packingMeta', cleanKey, metaObj[packingKey]);
            }
          }
          continue;
        }

        if (Array.isArray(rawCol)) {
          for (const rawItem of rawCol) {
            if (!rawItem || typeof rawItem !== 'object') continue;
            const itemObj = rawItem as Record<string, unknown>;
            const recordId =
              typeof itemObj.id === 'string' && itemObj.id.trim()
                ? itemObj.id.trim()
                : crypto.randomUUID();
            itemObj.id = recordId;
            await upsertRecord(collectionName, recordId, itemObj);
          }
        }
      }
    }

    // 6. Import global logs (error reports, employer requests, developer outbox)
    for (const gf of legacyGlobalFiles) {
      const items = safeReadJsonFile<unknown[]>(gf.file);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id =
          typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : crypto.randomUUID();
        const createdAtRaw = typeof obj.createdAt === 'string' ? obj.createdAt : '';
        const createdAt =
          createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw))
            ? createdAtRaw
            : new Date().toISOString();
        const logRes = await client.query(
          `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4::timestamptz, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [id, gf.logType, JSON.stringify({ ...obj, id }), createdAt],
        );
        if ((logRes.rowCount || 0) > 0) {
          summary.globalLogsImported += 1;
        }
      }
    }

    // 7. Persist permanent completion marker inside the same atomic transaction
    await client.query(
      `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
       VALUES ($1, 'system_meta', $2::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload,
             updated_at = NOW()`,
      [
        JSON_MIGRATION_COMPLETED_ID,
        JSON.stringify({
          completed: true,
          completedAt: new Date().toISOString(),
          employersImported: summary.employersImported,
          projectsImported: summary.projectsImported,
          recordsImported: summary.recordsImported,
          attachmentsExtracted: summary.attachmentsExtracted,
          globalLogsImported: summary.globalLogsImported,
        }),
      ],
    );
  }, pool);

  return summary;
}

// Allow standalone CLI execution: `npx tsx src/server/migrateJsonToPostgres.ts`
const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  (async () => {
    try {
      await runMigrations();
      await seedDefaultEmployersAndProjects();
      const result = await migrateJsonToPostgres();
      console.log('[migrateJsonToPostgres] Completed:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('[migrateJsonToPostgres] Migration failed:', err);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  })();
}
