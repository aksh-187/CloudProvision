-- ─── CloudProvision — SQLite Schema ──────────────────────────────────────────
-- All tables use IF NOT EXISTS so this file is safe to re-run (idempotent).
-- Foreign key enforcement is enabled at connection time in db.js.
-- Timestamps are stored as ISO-8601 UTC strings (TEXT) for SQLite portability.

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,          -- UUID v4
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,      -- enforced unique at DB level
  password_hash TEXT    NOT NULL,             -- bcrypt hash, never plaintext
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Provisioning Jobs ──────────────────────────────────────────────────────────
-- Tracks each infrastructure provisioning request end-to-end.
-- work_dir stores the absolute path to the isolated Terraform working directory.
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id              TEXT    PRIMARY KEY,         -- UUID v4
  user_id         TEXT    NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  resource_type   TEXT    NOT NULL,            -- 'ec2' | 's3' | 'rds'
  config          TEXT    NOT NULL DEFAULT '{}', -- JSON: user-supplied config
  status          TEXT    NOT NULL DEFAULT 'PENDING',
                  -- PENDING | PROVISIONING | READY | FAILED
                  -- DESTROYING | DESTROYED
  error_message   TEXT,                        -- populated on FAILED status
  work_dir        TEXT,                        -- absolute path to tf workspace
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id    ON provisioning_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON provisioning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON provisioning_jobs(created_at);

-- ── Resources ──────────────────────────────────────────────────────────────────
-- Stores the real AWS resource details captured from Terraform outputs.
-- One resource record per successfully provisioned job.
CREATE TABLE IF NOT EXISTS resources (
  id              TEXT    PRIMARY KEY,         -- UUID v4
  user_id         TEXT    NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  job_id          TEXT    NOT NULL UNIQUE
                    REFERENCES provisioning_jobs(id) ON DELETE CASCADE,
  resource_type   TEXT    NOT NULL,            -- 'ec2' | 's3' | 'rds'
  aws_resource_id TEXT,                        -- e.g. i-0abc123, bucket-name
  outputs         TEXT    NOT NULL DEFAULT '{}', -- JSON: raw terraform output -json
  status          TEXT    NOT NULL DEFAULT 'READY',
                  -- READY | DESTROYING | DESTROYED | FAILED
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  destroyed_at    TEXT                         -- set when status → DESTROYED
);

CREATE INDEX IF NOT EXISTS idx_resources_user_id    ON resources(user_id);
CREATE INDEX IF NOT EXISTS idx_resources_job_id     ON resources(job_id);
CREATE INDEX IF NOT EXISTS idx_resources_status     ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at);

-- ── Activity ───────────────────────────────────────────────────────────────────
-- Append-only audit log. Never updated, only inserted.
CREATE TABLE IF NOT EXISTS activity (
  id            TEXT    PRIMARY KEY,           -- UUID v4
  user_id       TEXT    NOT NULL
                  REFERENCES users(id) ON DELETE CASCADE,
  action        TEXT    NOT NULL,
                -- 'signup' | 'login' | 'logout'
                -- 'provision_requested' | 'provision_started'
                -- 'provision_succeeded' | 'provision_failed'
                -- 'destroy_requested' | 'destroy_succeeded' | 'destroy_failed'
  job_id        TEXT
                  REFERENCES provisioning_jobs(id) ON DELETE SET NULL,
  resource_id   TEXT
                  REFERENCES resources(id) ON DELETE SET NULL,
  status        TEXT,                          -- outcome label, free-form
  metadata      TEXT    NOT NULL DEFAULT '{}', -- JSON: extra context
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_user_id    ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_job_id     ON activity(job_id);
CREATE INDEX IF NOT EXISTS idx_activity_action     ON activity(action);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at);
