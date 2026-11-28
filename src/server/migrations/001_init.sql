-- SAMAAN Power Plant Warehouse Management System
-- Migration 001: Initial PostgreSQL Schema
-- Safe to run repeatedly (idempotent DDL)

CREATE TABLE IF NOT EXISTS employers (
  id TEXT PRIMARY KEY,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Strict One-to-Many (1:N) relationship:
-- One employer can hold unlimited default and custom projects.
-- `employer_id` is intentionally NON-UNIQUE with ON DELETE RESTRICT.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES employers(id) ON DELETE RESTRICT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  meta JSONB NOT NULL,
  session_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_employer_id
  ON projects (employer_id);

-- Unified JSONB persistence for all 19 project collections with optimistic locking (`version`)
CREATE TABLE IF NOT EXISTS project_records (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  collection_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (project_id, collection_name, record_id)
);

CREATE INDEX IF NOT EXISTS idx_project_records_project_collection
  ON project_records (project_id, collection_name);

CREATE INDEX IF NOT EXISTS idx_project_records_updated_at
  ON project_records (updated_at);

CREATE INDEX IF NOT EXISTS idx_project_records_active_lookup
  ON project_records (project_id, collection_name)
  WHERE deleted_at IS NULL;

-- System-wide logs & metadata (replaces samaan-error-reports.json, samaan-employer-requests.json, samaan-developer-outbox.json)
CREATE TABLE IF NOT EXISTS global_logs (
  id TEXT PRIMARY KEY,
  log_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_logs_type_created
  ON global_logs (log_type, created_at DESC);
