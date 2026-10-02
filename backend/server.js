'use strict';

/**
 * CloudProvision — entry point.
 *
 * Load order:
 *   1. dotenv       — environment variables
 *   2. createApp()  — Express app + eager DB migration
 *   3. reconcile()  — mark stuck PROVISIONING/DESTROYING jobs as FAILED
 *   4. listen()     — accept HTTP connections
 */

require('dotenv').config();

const { createApp }        = require('./app');
const { reconcileStuck }   = require('./services/provisioningService');
const logger               = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 3000;

const app = createApp();

// ── Startup reconciliation ─────────────────────────────────────────────────────
// Must run after DB migrations (triggered inside createApp via getDb()) but
// before accepting HTTP connections so no new requests arrive during recovery.
try {
  reconcileStuck();
} catch (err) {
  // Reconciliation failure must not prevent the server from starting —
  // log it prominently so it can be investigated manually.
  logger.error('Startup reconciliation error:', err.message);
}

const server = app.listen(PORT, () => {
  logger.info(`CloudProvision server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully.`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = { app, server };
