'use strict';

/**
 * SQLite connection singleton.
 *
 * Opens the database, sets required PRAGMAs, and runs migrations
 * on the first call to getDb(). Subsequent calls return the cached instance.
 */

const path     = require('path');
const Database = require('better-sqlite3');
const logger   = require('../utils/logger');

let _db = null;

/**
 * Returns the shared SQLite database instance.
 * Runs migrations on first call.
 *
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(__dirname, 'cloudprovision.sqlite');

  logger.info(`Database path: ${dbPath}`);

  _db = new Database(dbPath);

  // WAL mode — better read concurrency, safe for single-server use
  _db.pragma('journal_mode = WAL');

  // Foreign key enforcement — must be set per connection in SQLite
  _db.pragma('foreign_keys = ON');

  // Run idempotent schema migrations
  const { runMigrations } = require('./migrate');
  runMigrations(_db);

  return _db;
}

/**
 * Closes the database connection.
 * Used in graceful shutdown and test teardown.
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
