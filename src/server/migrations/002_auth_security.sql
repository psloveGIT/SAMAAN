-- SAMAAN Authentication, Multi-Project RBAC, SMS OTP & Session Security Schema
-- Requires 001_init.sql (`projects` table).
-- Compatible with PostgreSQL 14+ via node-postgres (pg). Zero Prisma dependencies.

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPERUSER', 'USER')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret_enc TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  requested_employer_id TEXT,
  requested_project_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON app_users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_app_users_phone
  ON app_users (phone);

CREATE INDEX IF NOT EXISTS idx_app_users_status
  ON app_users (status);

CREATE INDEX IF NOT EXISTS idx_app_users_role
  ON app_users (role);

-- Many-to-Many join table granting regular users access to 1, 2, or multiple approved projects simultaneously
CREATE TABLE IF NOT EXISTS user_project_access (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_project_access_user_id
  ON user_project_access (user_id);

CREATE INDEX IF NOT EXISTS idx_user_project_access_project_id
  ON user_project_access (project_id);

-- Short-lived hashed Iranian SMS OTP codes for LOGIN and REGISTER flows
CREATE TABLE IF NOT EXISTS sms_otps (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('LOGIN', 'REGISTER')),
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_otps_phone_purpose_created
  ON sms_otps (phone, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_otps_expires_at
  ON sms_otps (expires_at);

-- Hashed server-side authentication sessions with expiration & explicit revocation
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
  ON auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON auth_sessions (expires_at);
