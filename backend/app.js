'use strict';

/**
 * Express application factory.
 *
 * Configures middleware, session, and routes.
 * Calls getDb() on startup to run migrations eagerly before the first request.
 * Does NOT start the HTTP listener — that is done in server.js.
 * This separation makes the app importable in tests without binding a port.
 */

const path        = require('path');
const express     = require('express');
const session     = require('express-session');
const BetterSQLiteStore = require('better-sqlite3-session-store')(session);
const Database    = require('better-sqlite3');
const { getDb }   = require('./database/db');
const logger      = require('./utils/logger');

// Routes
const authRoutes      = require('./routes/auth');
const provisionRoutes = require('./routes/provision');
const resourceRoutes  = require('./routes/resources');

function createApp() {
  const app = express();

  // ── Eager database initialisation ────────────────────────────────────────────
  // Calling getDb() here runs migrations before the server accepts requests.
  // This ensures the schema exists even before the first API call.
  getDb();

  // ── Body parsing ─────────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // ── Session store (persistent SQLite) ────────────────────────────────────────
  // A dedicated SQLite file for sessions keeps session data separate from
  // application data and allows sessions to be cleared independently.
  const sessionDbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH).replace(/\.sqlite$/, '-sessions.sqlite')
    : path.join(__dirname, 'database', 'sessions.sqlite');

  const sessionDb = new Database(sessionDbPath);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === 'replace_with_a_long_random_secret') {
    logger.warn(
      'SESSION_SECRET is not set or is using the example value. ' +
      'Set a strong secret in your .env file before using this application.'
    );
  }

  app.use(session({
    store: new BetterSQLiteStore({ client: sessionDb }),
    secret: sessionSecret || 'insecure-default-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,                                   // not accessible via JS
      secure: process.env.NODE_ENV === 'production',    // HTTPS-only in prod
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,                      // 8-hour session
    },
    name: 'cloudprovision.sid',
  }));

  // ── Static frontend files ─────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  // ── API routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api',      provisionRoutes);
  app.use('/api',      resourceRoutes);

  // ── Health check ──────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status:    'ok',
      service:   'cloudprovision',
      timestamp: new Date().toISOString(),
    });
  });

  // ── 404 for unknown API routes ────────────────────────────────────────────────
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // ── SPA fallback ──────────────────────────────────────────────────────────────
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });

  // ── Global error handler ──────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'An internal server error occurred.' });
  });

  return app;
}

module.exports = { createApp };
