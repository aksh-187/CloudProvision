'use strict';

/**
 * Resource Controller
 *
 * GET /api/resources  — list the authenticated user's provisioned resources
 * GET /api/activity   — list the authenticated user's activity log
 */

const { getDb } = require('../database/db');
const logger    = require('../utils/logger');

// ── GET /api/resources ─────────────────────────────────────────────────────────

function getResources(req, res) {
  const userId = req.session.userId;

  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT
        r.id,
        r.user_id,
        r.job_id,
        r.resource_type,
        r.aws_resource_id,
        r.outputs,
        r.status,
        r.created_at,
        r.destroyed_at,
        j.config,
        j.error_message,
        j.status AS job_status,
        j.updated_at
      FROM resources r
      JOIN provisioning_jobs j ON j.id = r.job_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `).all(userId);

    const resources = rows.map(row => {
      let outputs = {};
      let config  = {};
      try { outputs = JSON.parse(row.outputs || '{}'); } catch {}
      try { config  = JSON.parse(row.config  || '{}'); } catch {}

      return {
        id:            row.id,
        jobId:         row.job_id,
        resourceType:  row.resource_type,
        awsResourceId: row.aws_resource_id,
        outputs,
        config,
        status:        row.status,
        jobStatus:     row.job_status,
        errorMessage:  row.job_status === 'FAILED' ? row.error_message : undefined,
        createdAt:     row.created_at,
        destroyedAt:   row.destroyed_at,
        updatedAt:     row.updated_at,
      };
    });

    return res.json({ resources });

  } catch (err) {
    logger.error('getResources error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch resources.' });
  }
}

// ── GET /api/activity ──────────────────────────────────────────────────────────

function getActivity(req, res) {
  const userId = req.session.userId;
  const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const db   = getDb();

    const rows = db.prepare(`
      SELECT
        a.id,
        a.action,
        a.job_id,
        a.resource_id,
        a.status,
        a.metadata,
        a.created_at,
        j.resource_type
      FROM activity a
      LEFT JOIN provisioning_jobs j ON j.id = a.job_id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(userId, limit);

    const activity = rows.map(row => {
      let metadata = {};
      try { metadata = JSON.parse(row.metadata || '{}'); } catch {}

      return {
        id:           row.id,
        action:       row.action,
        jobId:        row.job_id,
        resourceId:   row.resource_id,
        resourceType: row.resource_type,
        status:       row.status,
        metadata,
        createdAt:    row.created_at,
      };
    });

    return res.json({ activity });

  } catch (err) {
    logger.error('getActivity error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch activity.' });
  }
}

// ── GET /api/stats ─────────────────────────────────────────────────────────────

function getStats(req, res) {
  const userId = req.session.userId;

  try {
    const db = getDb();

    const total      = db.prepare("SELECT COUNT(*) AS n FROM resources WHERE user_id = ?").get(userId).n;
    const active     = db.prepare("SELECT COUNT(*) AS n FROM resources WHERE user_id = ? AND status = 'READY'").get(userId).n;
    const inProgress = db.prepare(`
      SELECT COUNT(*) AS n FROM provisioning_jobs
      WHERE user_id = ? AND status IN ('PENDING','PROVISIONING','DESTROYING')
    `).get(userId).n;
    const failed     = db.prepare("SELECT COUNT(*) AS n FROM resources WHERE user_id = ? AND status = 'FAILED'").get(userId).n;

    return res.json({ total, active, inProgress, failed });

  } catch (err) {
    logger.error('getStats error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch stats.' });
  }
}

module.exports = { getResources, getActivity, getStats };
