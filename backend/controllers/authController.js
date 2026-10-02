'use strict';

/**
 * Authentication Controller
 *
 * Handles signup, login, logout, and session-check.
 * Passwords are hashed with bcrypt. Sessions are managed by express-session
 * with a persistent SQLite store. No passwords or hashes are ever returned
 * in API responses.
 */

const bcrypt          = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDb }       = require('../database/db');
const { logActivity } = require('../services/activityService');
const logger          = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns a safe user object — never includes password_hash.
 */
function safeUser(row) {
  return {
    id:         row.id,
    name:       row.name,
    email:      row.email,
    created_at: row.created_at,
  };
}

// ── POST /api/auth/signup ──────────────────────────────────────────────────────
async function signup(req, res) {
  const { name, email, password } = req.body;

  try {
    const db = getDb();

    // Check for duplicate email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId       = uuidv4();
    const normalEmail  = email.toLowerCase().trim();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(userId, name.trim(), normalEmail, passwordHash);

    logActivity({ userId, action: 'signup', status: 'success' });

    logger.info(`New user registered: ${normalEmail}`);

    return res.status(201).json({
      message: 'Account created successfully.',
      user: safeUser({ id: userId, name: name.trim(), email: normalEmail, created_at: new Date().toISOString() }),
    });

  } catch (err) {
    logger.error('Signup error:', err.message);
    return res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
}

// ── POST /api/auth/login ───────────────────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;

  try {
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    // Use a constant-time compare even on "user not found" to prevent
    // timing-based email enumeration attacks.
    const dummyHash = '$2b$12$invalidhashpaddingtomatchbcryptlength000000000000000000000';
    const hashToCheck = user ? user.password_hash : dummyHash;
    const match = await bcrypt.compare(password, hashToCheck);

    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Regenerate session ID on login to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        logger.error('Session regeneration error:', err.message);
        return res.status(500).json({ error: 'Login failed. Please try again.' });
      }

      req.session.userId = user.id;

      logActivity({ userId: user.id, action: 'login', status: 'success' });
      logger.info(`User logged in: ${user.email}`);

      return res.json({
        message: 'Logged in successfully.',
        user: safeUser(user),
      });
    });

  } catch (err) {
    logger.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
function logout(req, res) {
  const userId = req.session?.userId;

  req.session.destroy((err) => {
    if (err) {
      logger.error('Session destroy error:', err.message);
      return res.status(500).json({ error: 'Logout failed.' });
    }

    // Clear the session cookie from the browser
    res.clearCookie('cloudprovision.sid');

    if (userId) {
      logActivity({ userId, action: 'logout', status: 'success' });
    }

    return res.json({ message: 'Logged out successfully.' });
  });
}

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
function me(req, res) {
  // requireAuth middleware ensures req.session.userId is present
  try {
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

    if (!user) {
      // Session references a deleted user — clear it
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }

    return res.json({ user: safeUser(user) });

  } catch (err) {
    logger.error('Me error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve user.' });
  }
}

module.exports = { signup, login, logout, me };
