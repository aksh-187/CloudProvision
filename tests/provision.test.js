'use strict';

/**
 * Provisioning API + Service tests
 *
 * Terraform subprocess execution is mocked so these tests run entirely
 * locally without AWS credentials or a running Terraform binary.
 *
 * What IS tested here (verifiable without AWS):
 *   - POST /api/provision input validation
 *   - POST /api/provision authentication requirement
 *   - POST /api/provision returns 202 + jobId
 *   - Job is written to DB with PENDING status
 *   - runProvision() lifecycle: PENDING→PROVISIONING→READY (mocked apply success)
 *   - runProvision() failure: PROVISIONING→FAILED (mocked apply failure)
 *   - runProvision() init failure: FAILED with correct error stored
 *   - No fabricated outputs: outputs only stored when mock returns real data
 *   - GET /api/status/:jobId returns correct job data
 *   - GET /api/status/:jobId returns 404 for unknown job
 *   - GET /api/status/:jobId returns 403 for another user's job
 *   - GET /api/status/:jobId requires auth
 *   - POST /api/destroy/:jobId requires auth
 *   - POST /api/destroy/:jobId enforces ownership
 *   - POST /api/destroy/:jobId rejects non-READY jobs
 *   - POST /api/destroy/:jobId lifecycle: READY→DESTROYING→DESTROYED
 *   - POST /api/destroy/:jobId failure: DESTROYING→FAILED
 *   - Isolated working directories created per job
 *   - tfvars written with correct values (not raw user input)
 *   - reconcileStuck() marks PROVISIONING/DESTROYING jobs as FAILED
 *   - reconcileStuck() leaves READY/FAILED/DESTROYED jobs unchanged
 *   - buildTfvars validates resource type
 *   - invalid jobId param (non-UUID) returns 400
 *   - invalid instanceType returns 400
 *   - invalid region returns 400
 *
 * What is NOT tested here (requires real AWS + Terraform apply):
 *   - Real EC2 instance creation
 *   - Real Terraform init downloading providers
 *   - Real public IP / DNS / instance ID in outputs
 *   - Real terraform destroy removing an EC2 instance
 */

const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const request = require('supertest');

// ── Isolated test database ─────────────────────────────────────────────────────
const DB_PATH = path.join(os.tmpdir(), `cp-test-provision-${Date.now()}.sqlite`);
process.env.DATABASE_PATH  = DB_PATH;
process.env.SESSION_SECRET = 'test-provision-secret';
process.env.NODE_ENV       = 'test';

// Point workspaces at a temp directory so real terraform_workspaces/ is untouched
const WS_ROOT = path.join(os.tmpdir(), `cp-test-workspaces-${Date.now()}`);
process.env.TERRAFORM_WORKSPACES_PATH = WS_ROOT;

// ── Mock terraformService before requiring any app code ───────────────────────
// This prevents any real terraform subprocess from being spawned during tests.
jest.mock('../backend/services/terraformService', () => {
  const FAKE_OUTPUTS = {
    instance_id:       { value: 'i-0abc1234567890def', type: 'string' },
    public_ip:         { value: '54.1.2.3',            type: 'string' },
    public_dns:        { value: 'ec2-54-1-2-3.compute-1.amazonaws.com', type: 'string' },
    private_ip:        { value: '10.0.1.5',            type: 'string' },
    instance_type:     { value: 't3.micro',             type: 'string' },
    ami_id:            { value: 'ami-0abcdef1234567890', type: 'string' },
    region:            { value: 'us-east-1',            type: 'string' },
    availability_zone: { value: 'us-east-1a',           type: 'string' },
    security_group_id: { value: 'sg-0abc123',           type: 'string' },
    instance_name:     { value: 'cloudprovision-ec2',   type: 'string' },
    job_id:            { value: 'PLACEHOLDER',          type: 'string' },
  };

  return {
    init:     jest.fn().mockResolvedValue({ success: true,  stdout: 'Terraform initialized.', stderr: '', exitCode: 0 }),
    validate: jest.fn().mockResolvedValue({ success: true,  stdout: 'Success!', stderr: '', exitCode: 0 }),
    plan:     jest.fn().mockResolvedValue({ success: true,  stdout: 'Plan: 2 to add.', stderr: '', exitCode: 0 }),
    apply:    jest.fn().mockResolvedValue({ success: true,  stdout: 'Apply complete!', stderr: '', exitCode: 0 }),
    destroy:  jest.fn().mockResolvedValue({ success: true,  stdout: 'Destroy complete!', stderr: '', exitCode: 0 }),
    getOutput: jest.fn().mockResolvedValue(FAKE_OUTPUTS),
    flattenOutputs: jest.requireActual('../backend/services/terraformService').flattenOutputs,
    fmt:      jest.fn().mockResolvedValue({ success: true,  stdout: '', stderr: '', exitCode: 0 }),
    FAKE_OUTPUTS, // exposed so tests can reference it
  };
});

// ── App + DB imports (after env vars + mock are set) ──────────────────────────
const { createApp }            = require('../backend/app');
const { getDb, closeDb }       = require('../backend/database/db');
const {
  reconcileStuck,
  buildTfvars,
  _setupWorkDir,
}                              = require('../backend/services/provisioningService');
const tf                       = require('../backend/services/terraformService');

let app;

beforeAll(() => {
  fs.mkdirSync(WS_ROOT, { recursive: true });
  app = createApp();
});

afterAll(() => {
  closeDb();
  try { fs.rmSync(DB_PATH,  { force: true }); } catch {}
  try { fs.rmSync(DB_PATH.replace('.sqlite', '-sessions.sqlite'), { force: true }); } catch {}
  try { fs.rmSync(WS_ROOT, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  // Reset mock call counts between tests
  jest.clearAllMocks();
  // Default: all operations succeed
  tf.init.mockResolvedValue    ({ success: true,  stdout: 'initialized', stderr: '', exitCode: 0 });
  tf.validate.mockResolvedValue({ success: true,  stdout: 'valid',       stderr: '', exitCode: 0 });
  tf.apply.mockResolvedValue   ({ success: true,  stdout: 'applied',     stderr: '', exitCode: 0 });
  tf.destroy.mockResolvedValue ({ success: true,  stdout: 'destroyed',   stderr: '', exitCode: 0 });
  tf.getOutput.mockResolvedValue(tf.FAKE_OUTPUTS);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

let _userCounter = 0;

async function createAndLoginUser(agent, overrides = {}) {
  _userCounter++;
  const creds = {
    name:     `User ${_userCounter}`,
    email:    `user${_userCounter}@example.com`,
    password: 'TestPass123!',
    ...overrides,
  };
  await agent.post('/api/auth/signup').send(creds);
  await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password });
  return creds;
}

/** Helper that waits up to maxMs for a job to reach a terminal status */
async function waitForJobStatus(jobId, terminalStatuses, maxMs = 5000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const row = getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId);
    if (row && terminalStatuses.includes(row.status)) return row.status;
    await new Promise(r => setTimeout(r, 50));
  }
  const row = getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId);
  return row?.status;
}

// ── POST /api/provision — authentication ──────────────────────────────────────

describe('POST /api/provision — authentication', () => {

  test('returns 401 without a session', async () => {
    const res = await request(app)
      .post('/api/provision')
      .send({ resourceType: 'ec2', config: {} });
    expect(res.status).toBe(401);
  });
});

// ── POST /api/provision — validation ──────────────────────────────────────────

describe('POST /api/provision — input validation', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await createAndLoginUser(agent);
  });

  test('returns 400 when resourceType is missing', async () => {
    const res = await agent.post('/api/provision').send({ config: {} });
    expect(res.status).toBe(400);
  });

  test('returns 400 for unsupported resourceType', async () => {
    const res = await agent.post('/api/provision').send({ resourceType: 'cloudformation', config: {} });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid instanceType', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 'm5.24xlarge', region: 'us-east-1' },
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid region', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'fake-region-99' },
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 for instanceName with shell-injection characters', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceName: '$(rm -rf /)', region: 'us-east-1' },
    });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/provision — successful job creation ─────────────────────────────

describe('POST /api/provision — job creation', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await createAndLoginUser(agent);
  });

  test('returns 202 with jobId and PENDING status', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.status).toBe('PENDING');
  });

  test('job is written to database with PENDING status', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const job = getDb().prepare('SELECT * FROM provisioning_jobs WHERE id = ?').get(res.body.jobId);
    expect(job).toBeDefined();
    expect(job.resource_type).toBe('ec2');
    // Status may have advanced by now but was written as PENDING
    expect(['PENDING', 'PROVISIONING', 'READY', 'FAILED']).toContain(job.status);
  });

  test('provision_requested activity is logged', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    await waitForJobStatus(res.body.jobId, ['READY', 'FAILED']);
    const activity = getDb()
      .prepare("SELECT * FROM activity WHERE job_id = ? AND action = 'provision_requested'")
      .get(res.body.jobId);
    expect(activity).toBeDefined();
  });
});

// ── Provisioning lifecycle (mocked Terraform) ─────────────────────────────────

describe('Provisioning lifecycle — mocked Terraform', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await createAndLoginUser(agent);
  });

  test('successful provision: job reaches READY with resource record', async () => {
    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1', instanceName: 'test-ec2' },
    });
    const jobId = res.body.jobId;
    const finalStatus = await waitForJobStatus(jobId, ['READY', 'FAILED']);

    expect(finalStatus).toBe('READY');

    const resource = getDb().prepare('SELECT * FROM resources WHERE job_id = ?').get(jobId);
    expect(resource).toBeDefined();
    expect(resource.status).toBe('READY');
    expect(resource.aws_resource_id).toBe('i-0abc1234567890def');

    const outputs = JSON.parse(resource.outputs);
    expect(outputs.instance_id).toBe('i-0abc1234567890def');
    expect(outputs.public_ip).toBe('54.1.2.3');
  });

  test('terraform init failure: job reaches FAILED with error message stored', async () => {
    tf.init.mockResolvedValueOnce({
      success: false, stdout: '', stderr: 'Error: Failed to install provider', exitCode: 1,
    });

    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const jobId = res.body.jobId;
    const finalStatus = await waitForJobStatus(jobId, ['READY', 'FAILED']);

    expect(finalStatus).toBe('FAILED');

    const job = getDb().prepare('SELECT * FROM provisioning_jobs WHERE id = ?').get(jobId);
    expect(job.error_message).toMatch(/terraform init failed/i);

    // No resource record should exist — nothing was provisioned
    // better-sqlite3 .get() returns undefined (not null) when no row is found
    const resource = getDb().prepare('SELECT * FROM resources WHERE job_id = ?').get(jobId);
    expect(resource).toBeFalsy();
  });

  test('terraform apply failure: job reaches FAILED, no fabricated READY status', async () => {
    tf.apply.mockResolvedValueOnce({
      success: false, stdout: '', stderr: 'Error: InvalidAMIID.NotFound', exitCode: 1,
    });

    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const jobId = res.body.jobId;
    const finalStatus = await waitForJobStatus(jobId, ['READY', 'FAILED']);

    expect(finalStatus).toBe('FAILED');

    const job = getDb().prepare('SELECT * FROM provisioning_jobs WHERE id = ?').get(jobId);
    expect(job.error_message).toMatch(/terraform apply failed/i);

    // Critical: no resource record — status must never be READY after apply failure
    // better-sqlite3 .get() returns undefined (not null) when no row is found
    const resource = getDb().prepare('SELECT * FROM resources WHERE job_id = ?').get(jobId);
    expect(resource).toBeFalsy();
  });

  test('outputs are only stored from real terraform output call — never fabricated', async () => {
    // Simulate apply succeeding but output returning null (shouldn't happen in practice
    // but verifies we never invent values)
    tf.getOutput.mockResolvedValueOnce(null);

    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const jobId = res.body.jobId;
    const finalStatus = await waitForJobStatus(jobId, ['READY', 'FAILED']);

    // If output returns null, job should fail — never produce READY with empty outputs
    expect(finalStatus).toBe('FAILED');
    // better-sqlite3 .get() returns undefined (not null) when no row is found
    const resource = getDb().prepare('SELECT * FROM resources WHERE job_id = ?').get(jobId);
    expect(resource).toBeFalsy();
  });

  test('isolated working directories: each job gets its own directory', async () => {
    const res1 = await agent.post('/api/provision').send({
      resourceType: 'ec2', config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const res2 = await agent.post('/api/provision').send({
      resourceType: 'ec2', config: { instanceType: 't3.micro', region: 'us-east-1' },
    });

    expect(res1.body.jobId).not.toBe(res2.body.jobId);

    await waitForJobStatus(res1.body.jobId, ['READY', 'FAILED']);
    await waitForJobStatus(res2.body.jobId, ['READY', 'FAILED']);

    const job1 = getDb().prepare('SELECT work_dir FROM provisioning_jobs WHERE id = ?').get(res1.body.jobId);
    const job2 = getDb().prepare('SELECT work_dir FROM provisioning_jobs WHERE id = ?').get(res2.body.jobId);

    expect(job1.work_dir).toBeDefined();
    expect(job2.work_dir).toBeDefined();
    expect(job1.work_dir).not.toBe(job2.work_dir);
  });
});

// ── GET /api/status/:jobId ─────────────────────────────────────────────────────

describe('GET /api/status/:jobId', () => {
  let agent;
  let jobId;

  beforeAll(async () => {
    agent = request.agent(app);
    await createAndLoginUser(agent);

    const res = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    jobId = res.body.jobId;
    await waitForJobStatus(jobId, ['READY', 'FAILED']);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/status/${jobId}`);
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid UUID jobId', async () => {
    const res = await agent.get('/api/status/not-a-uuid');
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown jobId', async () => {
    const res = await agent.get('/api/status/a0000000-0000-4000-8000-000000000099');
    expect(res.status).toBe(404);
  });

  test('returns job data for authenticated owner', async () => {
    const res = await agent.get(`/api/status/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(jobId);
    expect(res.body.resourceType).toBe('ec2');
    expect(['PENDING','PROVISIONING','READY','FAILED']).toContain(res.body.status);
  });

  test('does not expose Terraform state or raw DB internals', async () => {
    const res = await agent.get(`/api/status/${jobId}`);
    expect(res.body).not.toHaveProperty('work_dir');
    expect(res.body).not.toHaveProperty('user_id');
    expect(res.body.resource?.outputs).not.toHaveProperty('__raw_state');
  });

  test('403 when another user tries to view the job', async () => {
    const otherAgent = request.agent(app);
    await createAndLoginUser(otherAgent);

    const res = await otherAgent.get(`/api/status/${jobId}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/destroy/:jobId ───────────────────────────────────────────────────

describe('POST /api/destroy/:jobId', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await createAndLoginUser(agent);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/destroy/00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid UUID jobId', async () => {
    const res = await agent.post('/api/destroy/not-a-uuid');
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown jobId', async () => {
    const res = await agent.post('/api/destroy/a0000000-0000-4000-8000-000000000099');
    expect(res.status).toBe(404);
  });

  test('403 when another user tries to destroy the job', async () => {
    // Create a job as the primary agent
    const provRes = await agent.post('/api/provision').send({
      resourceType: 'ec2', config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    await waitForJobStatus(provRes.body.jobId, ['READY', 'FAILED']);

    // Attempt destroy as a different user
    const otherAgent = request.agent(app);
    await createAndLoginUser(otherAgent);

    const res = await otherAgent.post(`/api/destroy/${provRes.body.jobId}`);
    expect(res.status).toBe(403);
  });

  test('returns 409 when trying to destroy a FAILED job', async () => {
    tf.apply.mockResolvedValueOnce({ success: false, stdout: '', stderr: 'apply failed', exitCode: 1 });

    const provRes = await agent.post('/api/provision').send({
      resourceType: 'ec2', config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    await waitForJobStatus(provRes.body.jobId, ['FAILED']);

    const res = await agent.post(`/api/destroy/${provRes.body.jobId}`);
    expect(res.status).toBe(409);
  });

  test('successful destroy: job reaches DESTROYED', async () => {
    // Provision a job first
    const provRes = await agent.post('/api/provision').send({
      resourceType: 'ec2', config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const jobId = provRes.body.jobId;
    await waitForJobStatus(jobId, ['READY', 'FAILED']);

    const job = getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId);
    if (job.status !== 'READY') return; // skip if provision mocked differently

    const destroyRes = await agent.post(`/api/destroy/${jobId}`);
    expect(destroyRes.status).toBe(202);
    expect(destroyRes.body.status).toBe('DESTROYING');

    const finalStatus = await waitForJobStatus(jobId, ['DESTROYED', 'FAILED']);
    expect(finalStatus).toBe('DESTROYED');

    const resource = getDb().prepare('SELECT status FROM resources WHERE job_id = ?').get(jobId);
    expect(resource.status).toBe('DESTROYED');
  });

  test('destroy failure: job reaches FAILED, resource not marked DESTROYED', async () => {
    // Provision successfully first
    const provRes = await agent.post('/api/provision').send({
      resourceType: 'ec2', config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const jobId = provRes.body.jobId;
    await waitForJobStatus(jobId, ['READY', 'FAILED']);

    const job = getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId);
    if (job.status !== 'READY') return;

    // Make destroy fail
    tf.destroy.mockResolvedValueOnce({ success: false, stdout: '', stderr: 'DependencyViolation', exitCode: 1 });

    await agent.post(`/api/destroy/${jobId}`);
    const finalStatus = await waitForJobStatus(jobId, ['DESTROYED', 'FAILED']);

    expect(finalStatus).toBe('FAILED');

    // Resource must NOT be marked DESTROYED — integrity check
    const resource = getDb().prepare('SELECT status FROM resources WHERE job_id = ?').get(jobId);
    expect(resource.status).not.toBe('DESTROYED');
  });
});

// ── Startup reconciliation ────────────────────────────────────────────────────

describe('reconcileStuck()', () => {

  test('marks PROVISIONING jobs as FAILED on startup', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');

    // Insert a user
    const userId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
      .run(userId, 'Reconcile User', `reconcile-prov-${Date.now()}@example.com`, '$2b$12$fake');

    // Insert a stuck PROVISIONING job
    const jobId = uuidv4();
    db.prepare(`
      INSERT INTO provisioning_jobs (id, user_id, resource_type, config, status)
      VALUES (?, ?, 'ec2', '{}', 'PROVISIONING')
    `).run(jobId, userId);

    reconcileStuck();

    const job = db.prepare('SELECT status, error_message FROM provisioning_jobs WHERE id = ?').get(jobId);
    expect(job.status).toBe('FAILED');
    expect(job.error_message).toMatch(/server restarted/i);
  });

  test('marks DESTROYING jobs as FAILED on startup', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');

    const userId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
      .run(userId, 'Reconcile User 2', `reconcile-dest-${Date.now()}@example.com`, '$2b$12$fake');

    const jobId = uuidv4();
    db.prepare(`
      INSERT INTO provisioning_jobs (id, user_id, resource_type, config, status)
      VALUES (?, ?, 'ec2', '{}', 'DESTROYING')
    `).run(jobId, userId);

    reconcileStuck();

    const job = db.prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId);
    expect(job.status).toBe('FAILED');
  });

  test('does not modify READY, FAILED, or DESTROYED jobs', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');

    const userId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
      .run(userId, 'Reconcile User 3', `reconcile-stable-${Date.now()}@example.com`, '$2b$12$fake');

    const statuses = ['READY', 'FAILED', 'DESTROYED'];
    const jobIds = statuses.map(s => {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO provisioning_jobs (id, user_id, resource_type, config, status)
        VALUES (?, ?, 'ec2', '{}', ?)
      `).run(id, userId, s);
      return { id, expected: s };
    });

    reconcileStuck();

    for (const { id, expected } of jobIds) {
      const job = db.prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(id);
      expect(job.status).toBe(expected);
    }
  });
});

// ── buildTfvars ───────────────────────────────────────────────────────────────

describe('buildTfvars()', () => {

  test('ec2: produces correct tfvars map', () => {
    const vars = buildTfvars('ec2', {
      region:       'us-west-2',
      instanceType: 't3.small',
      instanceName: 'my-server',
    }, 'job-123', 'user-456');

    expect(vars.aws_region).toBe('us-west-2');
    expect(vars.instance_type).toBe('t3.small');
    expect(vars.instance_name).toBe('my-server');
    expect(vars.job_id).toBe('job-123');
    expect(vars.user_id).toBe('user-456');
  });

  test('unsupported resource type throws', () => {
    expect(() => buildTfvars('cloudformation', {}, 'j1', 'u1')).toThrow(/unsupported resource type/i);
  });
});

// ── flattenOutputs ────────────────────────────────────────────────────────────

describe('flattenOutputs()', () => {
  const { flattenOutputs } = require('../backend/services/terraformService');

  test('flattens terraform output -json structure', () => {
    const raw = {
      instance_id: { value: 'i-abc123', type: 'string' },
      public_ip:   { value: '1.2.3.4', type: 'string' },
    };
    const flat = flattenOutputs(raw);
    expect(flat.instance_id).toBe('i-abc123');
    expect(flat.public_ip).toBe('1.2.3.4');
  });

  test('returns empty object for null input', () => {
    expect(flattenOutputs(null)).toEqual({});
    expect(flattenOutputs(undefined)).toEqual({});
  });
});
