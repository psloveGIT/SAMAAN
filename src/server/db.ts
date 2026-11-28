import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool, PoolClient, PoolConfig } from 'pg';
import { BUILT_IN_EMPLOYERS } from '../shared/employers.ts';
import type { ProjectInfo } from '../shared/types.ts';

const { Pool: PgPool } = pg;

export type StorageMode = 'postgres' | 'json';
export type GlobalLogType =
  | 'error_report'
  | 'employer_request'
  | 'developer_outbox'
  | 'system_meta';

const DEFAULT_SEED_TIMESTAMP = '2026-05-27T00:00:00.000Z';

/**
 * Default built-in projects seeded on first boot — one default project per built-in MAPNA employer
 * (MD1, MD2, MD3), all linked via the 1:N `projects.employer_id -> employers(id)` foreign key.
 */
export const DEFAULT_SEED_PROJECTS: ProjectInfo[] = [
  {
    id: 'default',
    name: 'پروژه پیش‌فرض مپنا توسعه یک (MD1)',
    code: 'MD1-DEFAULT',
    employerId: 'mapna-md1',
    isDefault: true,
    createdAt: DEFAULT_SEED_TIMESTAMP,
  },
  {
    id: 'default-md2',
    name: 'پروژه پیش‌فرض مپنا توسعه دو (MD2)',
    code: 'MD2-DEFAULT',
    employerId: 'mapna-md2',
    isDefault: true,
    createdAt: DEFAULT_SEED_TIMESTAMP,
  },
  {
    id: 'default-md3',
    name: 'پروژه پیش‌فرض مپنا توسعه سه (MD3)',
    code: 'MD3-DEFAULT',
    employerId: 'mapna-md3',
    isDefault: true,
    createdAt: DEFAULT_SEED_TIMESTAMP,
  },
];

const DEFAULT_PROJECT_ID_SET = new Set<string>(DEFAULT_SEED_PROJECTS.map((p) => p.id));

export function isDefaultProjectId(id: string | undefined | null): boolean {
  const clean = (id || '').trim().toLowerCase();
  return DEFAULT_PROJECT_ID_SET.has(clean);
}

/**
 * Resolves the active persistence mode:
 * - Explicit `SAMAAN_STORAGE_MODE=json` forces local JSON persistence.
 * - Explicit `SAMAAN_STORAGE_MODE=postgres` requires `DATABASE_URL`.
 * - When `SAMAAN_STORAGE_MODE` is omitted, defaults to `postgres` whenever `DATABASE_URL` is set,
 *   and falls back cleanly to `json` otherwise.
 */
export function resolveStorageMode(env: NodeJS.ProcessEnv = process.env): StorageMode {
  const explicit = String(env.SAMAAN_STORAGE_MODE || '').trim().toLowerCase();
  const hasDbUrl = Boolean(String(env.DATABASE_URL || '').trim());

  if (explicit === 'json') {
    return 'json';
  }
  if (explicit === 'postgres') {
    if (!hasDbUrl) {
      throw new Error(
        'SAMAAN_STORAGE_MODE is set to "postgres" but DATABASE_URL is empty. Configure DATABASE_URL or set SAMAAN_STORAGE_MODE=json.',
      );
    }
    return 'postgres';
  }
  return hasDbUrl ? 'postgres' : 'json';
}

let sharedPool: Pool | null = null;

function buildPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const connectionString = String(env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL mode.');
  }

  const maxRaw = Number(env.PG_POOL_MAX || 20);
  const max = Number.isFinite(maxRaw) && maxRaw >= 2 && maxRaw <= 100 ? Math.floor(maxRaw) : 20;
  const sslMode = String(env.PGSSLMODE || '').trim().toLowerCase();

  const config: PoolConfig = {
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  if (sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca') {
    config.ssl = {
      rejectUnauthorized: sslMode !== 'require',
    };
  } else if (sslMode === 'disable') {
    config.ssl = false;
  }

  return config;
}

export function getPool(): Pool {
  if (!sharedPool) {
    sharedPool = new PgPool(buildPoolConfig());
    sharedPool.on('error', (err) => {
      console.error('[db] Unexpected PostgreSQL idle client error:', err);
    });
  }
  return sharedPool;
}

export async function closePool(): Promise<void> {
  if (sharedPool) {
    const p = sharedPool;
    sharedPool = null;
    await p.end();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  poolOverride?: Pool,
): Promise<T> {
  const pool = poolOverride || getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] Transaction rollback failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export function resolveMigrationsDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.join(currentDir, 'migrations');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return path.resolve(process.cwd(), 'src', 'server', 'migrations');
}

export function resolveMigrationSqlPath(fileName = '001_init.sql'): string {
  return path.join(resolveMigrationsDir(), fileName);
}

export function resolveMigrationSqlPaths(): string[] {
  const dir = resolveMigrationsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(dir, f));
}

export async function runMigrations(poolOverride?: Pool): Promise<void> {
  const sqlPaths = resolveMigrationSqlPaths();
  await withTransaction(async (client) => {
    for (const sqlPath of sqlPaths) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      if (sql.trim()) {
        await client.query(sql);
      }
    }
  }, poolOverride);
}

/**
 * Idempotently seeds all built-in MAPNA employers (`is_default = TRUE`) and
 * one default project per built-in employer (`is_default = TRUE`) on startup.
 */
export async function seedDefaultEmployersAndProjects(poolOverride?: Pool): Promise<void> {
  await withTransaction(async (client) => {
    for (const emp of BUILT_IN_EMPLOYERS) {
      await client.query(
        `INSERT INTO employers (id, is_default, data, created_at, updated_at)
         VALUES ($1, TRUE, $2::jsonb, $3::timestamptz, $4::timestamptz)
         ON CONFLICT (id) DO UPDATE
           SET is_default = TRUE`,
        [
          emp.id,
          JSON.stringify(emp),
          emp.createdAt || DEFAULT_SEED_TIMESTAMP,
          emp.updatedAt || DEFAULT_SEED_TIMESTAMP,
        ],
      );
    }

    for (const proj of DEFAULT_SEED_PROJECTS) {
      const secret = crypto.randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO projects (id, employer_id, is_default, meta, session_secret, created_at, updated_at)
         VALUES ($1, $2, TRUE, $3::jsonb, $4, $5::timestamptz, NOW())
         ON CONFLICT (id) DO UPDATE
           SET is_default = TRUE`,
        [
          proj.id,
          proj.employerId || 'mapna-md1',
          JSON.stringify(proj),
          secret,
          proj.createdAt || DEFAULT_SEED_TIMESTAMP,
        ],
      );
    }
  }, poolOverride);
}

const AUTH_SECRET_LOG_ID = 'samaan_auth_secret';

/**
 * Ensures a durable cluster-wide auth secret exists in `global_logs` (`system_meta`).
 */
export async function ensureAuthSecretInDb(poolOverride?: Pool): Promise<string> {
  const pool = poolOverride || getPool();
  const existing = await pool.query<{ payload: { authSecret?: string } }>(
    `SELECT payload FROM global_logs WHERE id = $1 AND log_type = 'system_meta' LIMIT 1`,
    [AUTH_SECRET_LOG_ID],
  );
  const existingSecret = existing.rows[0]?.payload?.authSecret;
  if (typeof existingSecret === 'string' && existingSecret.trim().length >= 32) {
    return existingSecret.trim();
  }

  const generated = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
     VALUES ($1, 'system_meta', $2::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [AUTH_SECRET_LOG_ID, JSON.stringify({ authSecret: generated })],
  );

  const reread = await pool.query<{ payload: { authSecret?: string } }>(
    `SELECT payload FROM global_logs WHERE id = $1 AND log_type = 'system_meta' LIMIT 1`,
    [AUTH_SECRET_LOG_ID],
  );
  return reread.rows[0]?.payload?.authSecret || generated;
}

export async function checkDatabaseHealth(
  poolOverride?: Pool,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    const pool = poolOverride || getPool();
    await pool.query('SELECT 1 AS ok');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listGlobalLogsFromDb<T>(
  logType: GlobalLogType,
  limit = 200,
  poolOverride?: Pool,
): Promise<T[]> {
  const pool = poolOverride || getPool();
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const res = await pool.query<{ payload: T }>(
    `SELECT payload
     FROM global_logs
     WHERE log_type = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [logType, safeLimit],
  );
  return res.rows.map((r) => r.payload);
}

export async function getGlobalLogById<T>(
  id: string,
  logType: GlobalLogType,
  poolOverride?: Pool,
): Promise<T | null> {
  const pool = poolOverride || getPool();
  const res = await pool.query<{ payload: T }>(
    `SELECT payload
     FROM global_logs
     WHERE id = $1 AND log_type = $2
     LIMIT 1`,
    [id, logType],
  );
  return res.rows[0]?.payload ?? null;
}

export async function upsertGlobalLogInDb(
  id: string,
  logType: GlobalLogType,
  payload: unknown,
  createdAt?: string,
  poolOverride?: Pool,
): Promise<void> {
  const pool = poolOverride || getPool();
  const ts = createdAt && !Number.isNaN(Date.parse(createdAt)) ? createdAt : new Date().toISOString();
  await pool.query(
    `INSERT INTO global_logs (id, log_type, payload, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::timestamptz, NOW())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = NOW()`,
    [id, logType, JSON.stringify(payload), ts],
  );
}

export async function deleteGlobalLogFromDb(
  id: string,
  logType: GlobalLogType,
  poolOverride?: Pool,
): Promise<boolean> {
  const pool = poolOverride || getPool();
  const res = await pool.query(
    `DELETE FROM global_logs WHERE id = $1 AND log_type = $2`,
    [id, logType],
  );
  return (res.rowCount || 0) > 0;
}
