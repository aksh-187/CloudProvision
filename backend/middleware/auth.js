'use strict';

/**
 * Authentication middleware — stub.
 * Full implementation in Phase 3.
 *
 * requireAuth: Rejects requests from unauthenticated users.
 * All protected routes must use this middleware.
 */

function requireAuth(req, res, next) {
  // Phase 3 will populate req.session.userId after login.
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

module.exports = { requireAuth };
