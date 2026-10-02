'use strict';

/**
 * Provisioning Service
 *
 * Orchestrates the full lifecycle of a CloudProvision infrastructure job:
 *
 *   createJob()       — validates input, creates DB record, returns jobId
 *   runProvision()    — async: init → apply → capture outputs → READY / FAILED
 *   runDestroy()      — async: destroy → DESTROYED / FAILED
 *   reconcileStuck()  — on startup: mark PROVISIONING/DESTROYING jobs as FAILED
 *
 * Each job gets an isolated Terraform working directory under
 * TERRAFORM_WORKSPACES_PATH/<jobId>/. The directory and its state file are
 * preserved until the resource is successfully destroyed.
 *
 * IMPORTANT: This service never fabricates resource IDs, IP addresses, DNS
 * names, or READY status. All outputs come from real `terraform output -json`
 * results. If Terraform fails, the job is marked FAILED with the actual error.
 */

const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

const { getDb }        = require('../database/db');
const { logActivity }  = require('./activityService');
const tf               = require('./terraformService');
const logger           = require('../utils/logger');

// ── Workspace path ─────────────────────────────────────────────────────────────

/**
 * Returns the root directory where per-job Terraform workspaces live.
 * Defaults to <project_root>/terraform_workspaces if not set via env.
 */
function getWorkspacesRoot() {
  if (process.env.TERRAFORM_WORKSPACES_PATH) {
    return path.resolve(process.env.TERRAFORM_WORKSPACES_PATH);
  }
  return path.resolve(__dirname, '..', '..', 'terraform_workspaces');
}

/**
 * Returns the absolute path to a specific job's working directory.
 * @param {string} jobId
 */
function getJobWorkDir(jobId) {
  return path.join(getWorkspacesRoot(), jobId);
}

// ── Terraform source module path ───────────────────────────────────────────────

/**
 * Returns the path to the Terraform source module for a resource type.
 * @param {'ec2'|'s3'|'rds'} resourceType
 */
function getTerraformModulePath(resourceType) {
  return path.resolve(__dirname, '..', '..', 'terraform', resourceType);
}

// ── Database helpers ───────────────────────────────────────────────────────────

function updateJobStatus(jobId, status, extra = {}) {
  const db = getDb();
  const sets = ['status = ?', "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
  const vals = [status];

  if (extra.errorMessage !== undefined) {
    sets.push('error_message = ?');
    vals.push(extra.errorMessage);
  }
  if (extra.workDir !== undefined) {
    sets.push('work_dir = ?');
    vals.push(extra.workDir);
  }

  vals.push(jobId);
  db.prepare(`UPDATE provisioning_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function getJob(jobId) {
  return getDb().prepare('SELECT * FROM provisioning_jobs WHERE id = ?').get(jobId);
}

// ── tfvars writer ──────────────────────────────────────────────────────────────

/**
 * Writes a terraform.tfvars file in the job's working directory.
 * Only allowlisted values from validated config are written.
 * Never writes raw user input — only values that have passed API validation.
 *
 * @param {string} workDir
 * @param {object} vars  key-value pairs, all pre-validated
 */
function writeTfvars(workDir, vars) {
  const lines = Object.entries(vars).map(([k, v]) => {
    // Escape backslashes and double-quotes in string values
    const safe = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${k} = "${safe}"`;
  });
  fs.writeFileSync(path.join(workDir, 'terraform.tfvars'), lines.join('\n') + '\n', 'utf8');
}

// ── Job log file ───────────────────────────────────────────────────────────────

function appendJobLog(workDir, line) {
  try {
    fs.appendFileSync(path.join(workDir, 'job.log'), line + '\n', 'utf8');
  } catch {
    // Never crash the provisioning flow due to a log write failure
  }
}

// ── Workspace setup ────────────────────────────────────────────────────────────

/**
 * Creates the job's isolated working directory and copies the Terraform
 * module files into it. The .tf files are copied (not symlinked) so each
 * job has a completely independent copy of the configuration.
 *
 * @param {string} jobId
 * @param {'ec2'|'s3'|'rds'} resourceType
 * @returns {string} absolute path to the created working directory
 */
function setupWorkDir(jobId, resourceType) {
  const workDir    = getJobWorkDir(jobId);
  const modulePath = getTerraformModulePath(resourceType);

  fs.mkdirSync(workDir, { recursive: true });

  // Copy .tf files from the module directory
  const tfFiles = fs.readdirSync(modulePath).filter(f => f.endsWith('.tf'));
  if (tfFiles.length === 0) {
    throw new Error(`No .tf files found in module path: ${modulePath}`);
  }
  for (const file of tfFiles) {
    fs.copyFileSync(path.join(modulePath, file), path.join(workDir, file));
  }

  appendJobLog(workDir, `[setup] Working directory created: ${workDir}`);
  appendJobLog(workDir, `[setup] Copied ${tfFiles.length} Terraform files from ${modulePath}`);

  return workDir;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Creates a provisioning job record in the database.
 * Validates that the resource type is supported.
 * Does NOT start Terraform — the HTTP response is returned first,
 * then runProvision() is called asynchronously.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {'ec2'} params.resourceType  — only 'ec2' supported in Milestone 2
 * @param {object} params.config       — validated config (instanceType, region, instanceName)
 * @returns {{ jobId: string }}
 */
function createJob({ userId, resourceType, config }) {
  const SUPPORTED = ['ec2'];
  if (!SUPPORTED.includes(resourceType)) {
    throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  const jobId = uuidv4();
  const db    = getDb();

  db.prepare(`
    INSERT INTO provisioning_jobs (id, user_id, resource_type, config, status)
    VALUES (?, ?, ?, ?, 'PENDING')
  `).run(jobId, userId, resourceType, JSON.stringify(config));

  logActivity({
    userId,
    jobId,
    action:   'provision_requested',
    status:   'pending',
    metadata: { resourceType, config },
  });

  logger.info(`Job created: ${jobId} (${resourceType}) for user ${userId}`);
  return { jobId };
}

/**
 * Runs the full provisioning lifecycle asynchronously:
 *   PENDING → PROVISIONING → READY  (success)
 *   PENDING → PROVISIONING → FAILED (on any error)
 *
 * Steps:
 *   1. Setup isolated working directory, copy .tf files
 *   2. Write terraform.tfvars with validated config
 *   3. terraform init
 *   4. terraform validate
 *   5. terraform apply -auto-approve
 *   6. terraform output -json → parse → store in resources table
 *
 * This function is intentionally NOT awaited by the HTTP handler.
 * The HTTP handler returns jobId immediately; the frontend polls status.
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.userId
 * @param {'ec2'} params.resourceType
 * @param {object} params.config
 */
async function runProvision({ jobId, userId, resourceType, config }) {
  let workDir;

  try {
    // ── Setup working directory ──────────────────────────────────────────────
    workDir = setupWorkDir(jobId, resourceType);
    updateJobStatus(jobId, 'PROVISIONING', { workDir });

    logActivity({ userId, jobId, action: 'provision_started', status: 'provisioning' });

    const log = (line) => appendJobLog(workDir, line);

    // ── Build tfvars ─────────────────────────────────────────────────────────
    const tfvars = buildTfvars(resourceType, config, jobId, userId);
    writeTfvars(workDir, tfvars);
    log('[tfvars] Written terraform.tfvars');

    // ── terraform init ───────────────────────────────────────────────────────
    log('[init] Running terraform init…');
    const initResult = await tf.init(workDir, { onLog: log });
    if (!initResult.success) {
      throw new Error(`terraform init failed:\n${initResult.stderr}`);
    }
    log('[init] terraform init succeeded');

    // ── terraform validate ───────────────────────────────────────────────────
    log('[validate] Running terraform validate…');
    const validateResult = await tf.validate(workDir, { onLog: log });
    if (!validateResult.success) {
      throw new Error(`terraform validate failed:\n${validateResult.stderr}`);
    }
    log('[validate] terraform validate succeeded');

    // ── terraform apply ──────────────────────────────────────────────────────
    log('[apply] Running terraform apply…');
    const applyResult = await tf.apply(workDir, { onLog: log });
    if (!applyResult.success) {
      throw new Error(`terraform apply failed:\n${applyResult.stderr}`);
    }
    log('[apply] terraform apply succeeded');

    // ── terraform output ─────────────────────────────────────────────────────
    log('[output] Collecting terraform outputs…');
    const rawOutputs = await tf.getOutput(workDir);
    if (!rawOutputs) {
      throw new Error('terraform output returned no data after successful apply');
    }
    const outputs = tf.flattenOutputs(rawOutputs);
    log(`[output] Outputs collected: ${Object.keys(outputs).join(', ')}`);

    // ── Store resource record ────────────────────────────────────────────────
    const resourceId    = uuidv4();
    const awsResourceId = outputs.instance_id || outputs.bucket_name || outputs.db_identifier || null;

    getDb().prepare(`
      INSERT INTO resources (id, user_id, job_id, resource_type, aws_resource_id, outputs, status)
      VALUES (?, ?, ?, ?, ?, ?, 'READY')
    `).run(resourceId, userId, jobId, resourceType, awsResourceId, JSON.stringify(outputs));

    updateJobStatus(jobId, 'READY');

    logActivity({
      userId,
      jobId,
      action:     'provision_succeeded',
      status:     'ready',
      metadata:   { awsResourceId, resourceType },
    });

    logger.info(`Job ${jobId} READY — resource ${awsResourceId}`);

  } catch (err) {
    const message = err.message || String(err);
    logger.error(`Job ${jobId} FAILED: ${message}`);

    if (workDir) appendJobLog(workDir, `[error] ${message}`);

    updateJobStatus(jobId, 'FAILED', { errorMessage: message.slice(0, 2000) });

    logActivity({
      userId,
      jobId,
      action:   'provision_failed',
      status:   'failed',
      metadata: { error: message.slice(0, 500) },
    });
  }
}

/**
 * Runs the destroy lifecycle asynchronously:
 *   READY → DESTROYING → DESTROYED (success)
 *   READY → DESTROYING → FAILED    (on any error)
 *
 * The working directory is removed only on successful destruction.
 * On failure the directory is preserved for debugging.
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.userId
 */
async function runDestroy({ jobId, userId }) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const workDir = job.work_dir;
  if (!workDir || !fs.existsSync(workDir)) {
    updateJobStatus(jobId, 'FAILED', {
      errorMessage: 'Terraform working directory not found — cannot destroy.',
    });
    logActivity({ userId, jobId, action: 'destroy_failed', status: 'failed',
      metadata: { error: 'work_dir missing' } });
    return;
  }

  const log = (line) => appendJobLog(workDir, line);

  try {
    updateJobStatus(jobId, 'DESTROYING');
    logActivity({ userId, jobId, action: 'destroy_requested', status: 'destroying' });

    log('[destroy] Running terraform destroy…');
    const result = await tf.destroy(workDir, { onLog: log });

    if (!result.success) {
      throw new Error(`terraform destroy failed:\n${result.stderr}`);
    }
    log('[destroy] terraform destroy succeeded');

    // Mark the resource record as DESTROYED
    getDb().prepare(`
      UPDATE resources
      SET status = 'DESTROYED',
          destroyed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE job_id = ?
    `).run(jobId);

    updateJobStatus(jobId, 'DESTROYED');

    logActivity({
      userId,
      jobId,
      action:   'destroy_succeeded',
      status:   'destroyed',
    });

    logger.info(`Job ${jobId} DESTROYED`);

    // Clean up working directory now that state is no longer needed
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      log('[cleanup] Working directory removed after successful destroy');
    } catch (cleanupErr) {
      logger.warn(`Could not remove workDir ${workDir}: ${cleanupErr.message}`);
    }

  } catch (err) {
    const message = err.message || String(err);
    logger.error(`Destroy job ${jobId} FAILED: ${message}`);

    appendJobLog(workDir, `[error] ${message}`);

    updateJobStatus(jobId, 'FAILED', { errorMessage: message.slice(0, 2000) });

    // Mark resource as FAILED too
    getDb().prepare(
      "UPDATE resources SET status = 'FAILED' WHERE job_id = ?"
    ).run(jobId);

    logActivity({
      userId,
      jobId,
      action:   'destroy_failed',
      status:   'failed',
      metadata: { error: message.slice(0, 500) },
    });
  }
}

/**
 * Startup reconciliation.
 *
 * Called once when the server starts. Any job still in PROVISIONING or
 * DESTROYING was interrupted by a server restart mid-operation. We cannot
 * know whether Terraform completed, so we mark these FAILED with a clear
 * reason. The working directory is preserved for manual inspection.
 *
 * This is the safe MVP approach — it never falsely marks a job READY.
 */
function reconcileStuck() {
  const db = getDb();
  const stuck = db.prepare(`
    SELECT id, user_id, status FROM provisioning_jobs
    WHERE status IN ('PROVISIONING', 'DESTROYING')
  `).all();

  if (stuck.length === 0) return;

  logger.warn(`Reconciliation: ${stuck.length} stuck job(s) found — marking FAILED`);

  const reason = 'Server restarted while operation was in progress. Manual verification required.';

  for (const job of stuck) {
    updateJobStatus(job.id, 'FAILED', { errorMessage: reason });

    logActivity({
      userId:   job.user_id,
      jobId:    job.id,
      action:   job.status === 'PROVISIONING' ? 'provision_failed' : 'destroy_failed',
      status:   'failed',
      metadata: { reason: 'server_restart' },
    });

    logger.warn(`Reconciliation: job ${job.id} (was ${job.status}) → FAILED`);
  }
}

// ── tfvars builder ─────────────────────────────────────────────────────────────

/**
 * Builds the tfvars map for a given resource type.
 * Only pre-validated values from the API layer are used here.
 * This function never receives raw user input — the controller validates first.
 *
 * @param {'ec2'} resourceType
 * @param {object} config
 * @param {string} jobId
 * @param {string} userId
 * @returns {object}
 */
function buildTfvars(resourceType, config, jobId, userId) {
  switch (resourceType) {
    case 'ec2':
      return {
        aws_region:    config.region       || 'us-east-1',
        instance_type: config.instanceType || 't3.micro',
        instance_name: config.instanceName || 'cloudprovision-ec2',
        job_id:        jobId,
        user_id:       userId,
      };
    default:
      throw new Error(`buildTfvars: unsupported resource type ${resourceType}`);
  }
}

module.exports = {
  createJob,
  runProvision,
  runDestroy,
  reconcileStuck,
  getJobWorkDir,
  buildTfvars,
  // Exported for testing
  _setupWorkDir:     setupWorkDir,
  _writeTfvars:      writeTfvars,
  _updateJobStatus:  updateJobStatus,
  _getJob:           getJob,
};
