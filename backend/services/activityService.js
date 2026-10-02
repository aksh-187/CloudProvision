'use strict';

/**
 * Activity Service
 *
 * Provides a single function for appending records to the activity log.
 * The activity table is append-only — records are never updated or deleted.
 *
 * Action values used across the application:
 *   signup               provisioned_started
 *   login                provision_succeeded
 *   logout               provision_failed
 *   provision_requested  destroy_requested
 *                        destroy_succeeded
 *                        destroy_failed
 */

const { v4: uuidv4 } = require('uuid');
const { getDb }      = require('../database/db');
const logger         = require('../utils/logger');

/**
 * Appends one record to the activity log.
 *
 * @param {object} params
 * @param {string}  params.userId      - Required. The acting user's ID.
 * @param {string}  params.action      - Required. Event name (see list above).
 * @param {string}  [params.jobId]     - Optional. Associated provisioning job.
 * @param {string}  [params.resourceId]- Optional. Associated resource.
 * @param {string}  [params.status]    - Optional. Outcome label (e.g. 'success').
 * @param {object}  [params.metadata]  - Optional. Extra JSON context.
 */
function logActivity({ userId, action, jobId = null, resourceId = null, status = null, metadata = {} }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO activity (id, user_id, action, job_id, resource_id, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      userId,
      action,
      jobId,
      resourceId,
      status,
      JSON.stringify(metadata)
    );
  } catch (err) {
    // Activity logging must never crash the main request flow.
    // Log the error and continue.
    logger.error('Failed to write activity log:', err.message);
  }
}

module.exports = { logActivity };
