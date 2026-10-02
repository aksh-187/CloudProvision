'use strict';

/**
 * Database tests
 *
 * Verifies:
 *  - migrations run without error
 *  - all four required tables exist
 *  - foreign keys are enforced
 *  - all expected indexes exist
 *  - migrations are idempotent (safe to run twice)
 */

const path = require('path');
const os   = require('os');

// Point to a temp DB for tests — never touches the real database
process.env.DATABASE_PATH = path.join(os.tmpdir(), `cp-test-db-${Date.now()}.sqlite`);
process.env.SESSION_SECRET = 'test-session-secret';

const { getDb, closeDb } = require('../backend/database/db');

describe('Database — migrations', () => {

  let db;

  beforeAll(() => {
    db = getDb();
  });

  afterAll(() => {
    closeDb();
    // Clean up temp file
    try { require('fs').unlinkSync(process.env.DATABASE_PATH); } catch {}
  });

  // ── Tables ──────────────────────────────────────────────────────────────────

  test('users table exists', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    expect(row).toBeDefined();
    expect(row.name).toBe('users');
  });

  test('provisioning_jobs table exists', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provisioning_jobs'").get();
    expect(row).toBeDefined();
  });

  test('resources table exists', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resources'").get();
    expect(row).toBeDefined();
  });

  test('activity table exists', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activity'").get();
    expect(row).toBeDefined();
  });

  // ── Foreign keys ────────────────────────────────────────────────────────────

  test('foreign keys are enabled', () => {
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  test('WAL journal mode is active', () => {
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });

  test('foreign key constraint is enforced (insert invalid user_id into jobs)', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO provisioning_jobs (id, user_id, resource_type, config)
        VALUES ('job-fk-test', 'nonexistent-user-id', 'ec2', '{}')
      `).run();
    }).toThrow();
  });

  // ── Indexes ─────────────────────────────────────────────────────────────────

  const expectedIndexes = [
    'idx_users_email',
    'idx_jobs_user_id',
    'idx_jobs_status',
    'idx_jobs_created_at',
    'idx_resources_user_id',
    'idx_resources_job_id',
    'idx_resources_status',
    'idx_resources_created_at',
    'idx_activity_user_id',
    'idx_activity_job_id',
    'idx_activity_action',
    'idx_activity_created_at',
  ];

  test.each(expectedIndexes)('index "%s" exists', (indexName) => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(indexName);
    expect(row).toBeDefined();
    expect(row.name).toBe(indexName);
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  test('running migrations twice does not throw or corrupt data', () => {
    const { runMigrations } = require('../backend/database/migrate');
    expect(() => runMigrations(db)).not.toThrow();

    // Tables must still exist after second run
    const tables = ['users', 'provisioning_jobs', 'resources', 'activity'];
    for (const t of tables) {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      expect(row).toBeDefined();
    }
  });

  // ── users table columns ──────────────────────────────────────────────────────

  test('users table has required columns', () => {
    const cols = db.pragma('table_info(users)').map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('email');
    expect(cols).toContain('password_hash');
    expect(cols).toContain('created_at');
  });

  // ── provisioning_jobs columns ────────────────────────────────────────────────

  test('provisioning_jobs table has required columns', () => {
    const cols = db.pragma('table_info(provisioning_jobs)').map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('resource_type');
    expect(cols).toContain('config');
    expect(cols).toContain('status');
    expect(cols).toContain('error_message');
    expect(cols).toContain('work_dir');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
  });

  // ── resources columns ────────────────────────────────────────────────────────

  test('resources table has required columns', () => {
    const cols = db.pragma('table_info(resources)').map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('job_id');
    expect(cols).toContain('resource_type');
    expect(cols).toContain('aws_resource_id');
    expect(cols).toContain('outputs');
    expect(cols).toContain('status');
    expect(cols).toContain('created_at');
    expect(cols).toContain('destroyed_at');
  });

  // ── activity columns ─────────────────────────────────────────────────────────

  test('activity table has required columns', () => {
    const cols = db.pragma('table_info(activity)').map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('action');
    expect(cols).toContain('job_id');
    expect(cols).toContain('resource_id');
    expect(cols).toContain('status');
    expect(cols).toContain('metadata');
    expect(cols).toContain('created_at');
  });
});
