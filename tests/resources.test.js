'use strict';

/**
 * Resources, Activity, and Stats API tests
 *
 * Tests GET /api/resources, GET /api/activity, GET /api/stats
 * with real DB, no Terraform subprocess (mocked).
 */

const path    = require('path');
const os      = require('os');
const request = require('supertest');

const DB_PATH = path.join(os.tmpdir(), `cp-test-resources-${Date.now()}.sqlite`);
process.env.DATABASE_PATH  = DB_PATH;
process.env.SESSION_SECRET = 'test-resources-secret';
process.env.NODE_ENV       = 'test';
process.env.TERRAFORM_WORKSPACES_PATH = path.join(os.tmpdir(), `cp-test-ws-res-${Date.now()}`);

// Mock Terraform so no real subprocess is spawned
jest.mock('../backend/services/terraformService', () => ({
  init:     jest.fn().mockResolvedValue({ success: true,  stdout: 'ok', stderr: '', exitCode: 0 }),
  validate: jest.fn().mockResolvedValue({ success: true,  stdout: 'ok', stderr: '', exitCode: 0 }),
  apply:    jest.fn().mockResolvedValue({ success: true,  stdout: 'ok', stderr: '', exitCode: 0 }),
  destroy:  jest.fn().mockResolvedValue({ success: true,  stdout: 'ok', stderr: '', exitCode: 0 }),
  getOutput: jest.fn().mockResolvedValue({
    instance_id: { value: 'i-0test1234567890', type: 'string' },
    public_ip:   { value: '1.2.3.4',           type: 'string' },
    region:      { value: 'us-east-1',          type: 'string' },
  }),
  flattenOutputs: jest.requireActual('../backend/services/terraformService').flattenOutputs,
  fmt:      jest.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
  FAKE_OUTPUTS: {},
}));

const { createApp }      = require('../backend/app');
const { getDb, closeDb } = require('../backend/database/db');
const fs                 = require('fs');

let app;

beforeAll(() => {
  fs.mkdirSync(process.env.TERRAFORM_WORKSPACES_PATH, { recursive: true });
  app = createApp();
});

afterAll(() => {
  closeDb();
  try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  try { fs.rmSync(DB_PATH.replace('.sqlite', '-sessions.sqlite'), { force: true }); } catch {}
  try { fs.rmSync(process.env.TERRAFORM_WORKSPACES_PATH, { recursive: true, force: true }); } catch {}
});

// ── Helpers ────────────────────────────────────────────────────────────────────

let _counter = 0;

async function createLoggedInAgent() {
  _counter++;
  const agent = request.agent(app);
  const creds = {
    name:     `Res User ${_counter}`,
    email:    `resuser${_counter}@example.com`,
    password: 'TestPass123!',
  };
  await agent.post('/api/auth/signup').send(creds);
  await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password });
  return agent;
}

async function waitForStatus(jobId, statuses, maxMs = 5000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const row = getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId);
    if (row && statuses.includes(row.status)) return row.status;
    await new Promise(r => setTimeout(r, 50));
  }
  return getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(jobId)?.status;
}

// ── GET /api/resources ─────────────────────────────────────────────────────────

describe('GET /api/resources', () => {

  test('requires authentication', async () => {
    const res = await request(app).get('/api/resources');
    expect(res.status).toBe(401);
  });

  test('returns empty array for new user', async () => {
    const agent = await createLoggedInAgent();
    const res = await agent.get('/api/resources');
    expect(res.status).toBe(200);
    expect(res.body.resources).toEqual([]);
  });

  test('returns resources after successful provision', async () => {
    const agent = await createLoggedInAgent();
    const prov = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    await waitForStatus(prov.body.jobId, ['READY', 'FAILED']);

    const res = await agent.get('/api/resources');
    expect(res.status).toBe(200);

    const job = getDb().prepare('SELECT status FROM provisioning_jobs WHERE id = ?').get(prov.body.jobId);
    if (job.status === 'READY') {
      expect(res.body.resources.length).toBeGreaterThan(0);
      const r = res.body.resources[0];
      expect(r.jobId).toBe(prov.body.jobId);
      expect(r.resourceType).toBe('ec2');
      expect(r.status).toBe('READY');
      expect(r.outputs).toBeDefined();
      expect(r.outputs.instance_id).toBe('i-0test1234567890');
    }
  });

  test('does not return another user\'s resources', async () => {
    const agent1 = await createLoggedInAgent();
    const agent2 = await createLoggedInAgent();

    await agent1.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });

    const res = await agent2.get('/api/resources');
    expect(res.status).toBe(200);
    // agent2 should see no resources from agent1
    const body1 = await agent1.get('/api/resources');
    const body2 = res;

    const ids1 = body1.body.resources.map(r => r.jobId);
    const ids2 = body2.body.resources.map(r => r.jobId);
    const overlap = ids1.filter(id => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test('response does not include password_hash or user_id', async () => {
    const agent = await createLoggedInAgent();
    await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });

    const res = await agent.get('/api/resources');
    expect(res.status).toBe(200);
    res.body.resources.forEach(r => {
      expect(r).not.toHaveProperty('password_hash');
      expect(r).not.toHaveProperty('user_id');
    });
  });
});

// ── GET /api/activity ──────────────────────────────────────────────────────────

describe('GET /api/activity', () => {

  test('requires authentication', async () => {
    const res = await request(app).get('/api/activity');
    expect(res.status).toBe(401);
  });

  test('returns activity after signup and login', async () => {
    const agent = await createLoggedInAgent();
    const res = await agent.get('/api/activity');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activity)).toBe(true);
    expect(res.body.activity.length).toBeGreaterThan(0);

    const actions = res.body.activity.map(a => a.action);
    expect(actions).toContain('signup');
    expect(actions).toContain('login');
  });

  test('activity is newest-first', async () => {
    const agent = await createLoggedInAgent();
    const res = await agent.get('/api/activity');

    const items = res.body.activity;
    for (let i = 0; i < items.length - 1; i++) {
      const t1 = new Date(items[i].createdAt).getTime();
      const t2 = new Date(items[i+1].createdAt).getTime();
      expect(t1).toBeGreaterThanOrEqual(t2);
    }
  });

  test('limit query param restricts results', async () => {
    const agent = await createLoggedInAgent();
    // Generate some activity
    await agent.post('/api/auth/logout');
    await agent.post('/api/auth/login').send({ email: `resuser${_counter}@example.com`, password: 'TestPass123!' });

    const res = await agent.get('/api/activity?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.activity.length).toBeLessThanOrEqual(2);
  });

  test('does not return another user\'s activity', async () => {
    const agent1 = await createLoggedInAgent();
    const agent2 = await createLoggedInAgent();

    const res1 = await agent1.get('/api/activity');
    const res2 = await agent2.get('/api/activity');

    // Users should have separate activity logs
    const emails1 = new Set(res1.body.activity.map(a => a.userId));
    const emails2 = new Set(res2.body.activity.map(a => a.userId));
    // Neither set should overlap (user IDs are different)
    // Just verify each user has their own signup entry count
    const signups1 = res1.body.activity.filter(a => a.action === 'signup').length;
    const signups2 = res2.body.activity.filter(a => a.action === 'signup').length;
    expect(signups1).toBe(1);
    expect(signups2).toBe(1);
  });

  test('provisioning events appear in activity after provision', async () => {
    const agent = await createLoggedInAgent();
    const prov = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    await waitForStatus(prov.body.jobId, ['READY', 'FAILED']);

    const res = await agent.get('/api/activity');
    const actions = res.body.activity.map(a => a.action);
    expect(actions).toContain('provision_requested');
    expect(actions.some(a => a.startsWith('provision_'))).toBe(true);
  });
});

// ── GET /api/stats ─────────────────────────────────────────────────────────────

describe('GET /api/stats', () => {

  test('requires authentication', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(401);
  });

  test('returns zero stats for new user', async () => {
    const agent = await createLoggedInAgent();
    const res = await agent.get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.active).toBe(0);
    expect(res.body.inProgress).toBe(0);
    expect(res.body.failed).toBe(0);
  });

  test('total increments after provision', async () => {
    const agent = await createLoggedInAgent();

    const before = await agent.get('/api/stats');
    expect(before.body.total).toBe(0);

    const prov = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    await waitForStatus(prov.body.jobId, ['READY', 'FAILED']);

    const after = await agent.get('/api/stats');
    expect(after.body.total).toBe(1);
  });

  test('active count reflects READY resources', async () => {
    const agent = await createLoggedInAgent();

    const prov = await agent.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });
    const finalStatus = await waitForStatus(prov.body.jobId, ['READY', 'FAILED']);
    const stats = await agent.get('/api/stats');

    if (finalStatus === 'READY') {
      expect(stats.body.active).toBeGreaterThanOrEqual(1);
    } else {
      // FAILED: active stays 0, failed increments
      expect(stats.body.active).toBe(0);
    }
  });

  test('stats are isolated per user', async () => {
    const agent1 = await createLoggedInAgent();
    const agent2 = await createLoggedInAgent();

    await agent1.post('/api/provision').send({
      resourceType: 'ec2',
      config: { instanceType: 't3.micro', region: 'us-east-1' },
    });

    const stats2 = await agent2.get('/api/stats');
    // agent2 should see 0 — they have no resources
    expect(stats2.body.total).toBe(0);
  });
});
