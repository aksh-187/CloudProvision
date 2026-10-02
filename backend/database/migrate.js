'use strict';

/**
 * Database migration runner.
 *
 * Reads schema.sql and executes it against the provided database connection.
 * All CREATE TABLE / CREATE INDEX statements use IF NOT EXISTS — the migration
 * is fully idempotent and safe to run on every application startup.
 *
 * Usage:
 *   const { runMigrations } = require('./migrate');
 *   runMigrations(db);   // db is a better-sqlite3 Database instance
 */

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Runs the schema.sql migration against the given database.
 * Safe to call on every startup — uses IF NOT EXISTS throughout.
 *
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  logger.info('Running database migrations…');

  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');

  // Execute the entire schema in a single transaction so a partial failure
  // does not leave the database in an inconsistent state.
  db.exec(sql);

  // Verify the four required tables exist after migration.
  const expected = ['users', 'provisioning_jobs', 'resources', 'activity'];
  for (const table of expected) {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!row) {
      throw new Error(`Migration failed: table '${table}' was not created.`);
    }
  }

  logger.info('Database migrations complete.');
}

module.exports = { runMigrations };
