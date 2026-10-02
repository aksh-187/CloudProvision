'use strict';

/**
 * Provisioning Controller
 *
 * Handles the three provisioning API endpoints:
 *   POST /api/provision        — create job, kick off async Terraform
 *   GET  /api/status/:jobId    — return job + resource status
 *   POST /api/destroy/:jobId   — verify ownership, kick off async destroy
 *
 * Authorization is enforced here on every operation:
 *   - requireAuth middleware ensures the user is authenticated
 *   - every job/resource lookup verifies user_id matches session userId
 *   - a user cannot see or destroy another user's job by guessing a jobId
 */

const {
  createJob,
  runProvision,
  runDestroy,
}               = require('../services/provisioningService');
const { getDb } = require('../database/db');
const logger    = require('../utils/logger');

// ── POST /api/provision ────────────────────────────────────────────────────────

async function provision(req, res) {
  const userId = req.session.userId;
  const { resourceType, config } = req.body;

  try {
    // createJob validates resourceType and writes the DB record
    const { jobId } = createJob({ userId, resourceType, config });

    // Return immediately — Terraform runs asynchronously
    res.status(202).json({
      message:      'Provisioning job created.',
      jobId,
      status:       'PENDING',
      resourceType,
    });

    // Fire-and-forget — intentionally not awaited
    // Errors are caught inside runProvision and written to the DB
    runProvision({ jobId, userId, resourceType, config }).catch((err) => {
      logger.error(`Unhandled runProvision error for job ${jobId}: ${err.message}`);
    });

  } catch (err) {
    logger.error(`provision error: ${err.message}`);
    if (err.message.startsWith('Unsupported resource type')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to create provisioning job.' });
  }
}

// ── GET /api/status/:jobId ─────────────────────────────────────────────────────

function status(req, res) {
  const userId = req.session.userId;
  const { jobId } = req.params;

  const db  = getDb();
  const job = db.prepare('SELECT * FROM provisioning_jobs WHERE id = ?').get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // Authorization: user may only view their own jobs
  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Fetch associated resource if it exists
  const resource = db.prepare('SELECT * FROM resources WHERE job_id = ?').get(jobId);

  // Parse config and outputs — never return raw internal fields
  let config  = {};
  let outputs = {};
  try { config  = JSON.parse(job.config  || '{}'); } catch {}
  try { outputs = resource ? JSON.parse(resource.outputs || '{}') : {}; } catch {}

  return res.json({
    jobId:        job.id,
    resourceType: job.resource_type,
    status:       job.status,
    errorMessage: job.status === 'FAILED' ? job.error_message : undefined,
    config,
    createdAt:    job.created_at,
    updatedAt:    job.updated_at,
    resource: resource ? {
      resourceId:    resource.id,
      awsResourceId: resource.aws_resource_id,
      status:        resource.status,
      outputs,
      createdAt:     resource.created_at,
      destroyedAt:   resource.destroyed_at,
    } : null,
  });
}

// ── POST /api/destroy/:jobId ───────────────────────────────────────────────────

async function destroyResource(req, res) {
  const userId = req.session.userId;
  const { jobId } = req.params;

  const db  = getDb();
  const job = db.prepare('SELECT * FROM provisioning_jobs WHERE id = ?').get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // Authorization: user may only destroy their own resources
  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Only READY jobs can be destroyed
  if (job.status !== 'READY') {
    return res.status(409).json({
      error:  `Cannot destroy a job with status '${job.status}'. Only READY jobs can be destroyed.`,
      status: job.status,
    });
  }

  try {
    // Return immediately — Terraform destroy runs asynchronously
    res.status(202).json({
      message: 'Destroy job initiated.',
      jobId,
      status:  'DESTROYING',
    });

    // Fire-and-forget — errors are caught inside runDestroy
    runDestroy({ jobId, userId }).catch((err) => {
      logger.error(`Unhandled runDestroy error for job ${jobId}: ${err.message}`);
    });

  } catch (err) {
    logger.error(`destroyResource error: ${err.message}`);
    return res.status(500).json({ error: 'Failed to initiate destroy.' });
  }
}

module.exports = { provision, status, destroyResource };
