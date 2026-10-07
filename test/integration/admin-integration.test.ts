/**
 * Integration + security tests for the Admin API.
 *
 * Requires the backend to be running (`npm run dev` in /backend) and a live
 * database. Set `API_BASE` to point at it (defaults to http://localhost:8000).
 *
 * Run: `npm run test:integration` (from /backend).
 *
 * NOTE: `node:test` executes suites in declaration order. Each suite fully
 * re-establishes its own admin token at setup so no suite depends on the
 * shared module state left by another.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.API_BASE || 'http://localhost:8000';
const prisma = new PrismaClient();

const SEED_EMAIL = 'john@kipruto.ke';
const SEED_PASS = 'MedRemote2026!';

const RUN_ID = `it${Date.now().toString(36)}`;
const TEST_PASSWORD = 'password';
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

async function api(
  path: string,
  { method = 'GET', token, body }: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function signin(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: email, password }),
  });
  const json = await res.json();
  return json?.accessToken ?? null;
}

async function setSeedRole(role: 'USER' | 'ADMIN'): Promise<void> {
  await prisma.user.updateMany({ where: { email: SEED_EMAIL }, data: { role } });
}

async function uniqueEmail(prefix: string): Promise<string> {
  return `${prefix}-${RUN_ID}@test.ke`;
}

let phoneCounter = 0;
function uniquePhone(): string {
  // Start from a stable base and bump to avoid unique collisions across users.
  phoneCounter += 1;
  const digits = String(700000000 + phoneCounter);
  return `2547${digits.slice(-8)}`;
}

describe('Admin API — Security', () => {
  let adminToken: string | null = null;
  let userToken: string | null = null;
  let syntheticUserId: string | null = null;

  before(async () => {
    // Create a valid non-admin user for the 403 checks.
    const email = await uniqueEmail('sec');
    const created = await prisma.user.create({
      data: {
        firstName: 'Sec',
        lastName: 'Test',
        phoneNumber: uniquePhone(),
        email,
        passwordHash: TEST_PASSWORD_HASH,
        role: 'USER',
        tier: 'FREE',
      },
    });
    syntheticUserId = created.id;
    userToken = await signin(email, TEST_PASSWORD);

    // Elevate seed user for the masking/encryption checks in this suite.
    await setSeedRole('ADMIN');
    adminToken = await signin(SEED_EMAIL, SEED_PASS);
    assert.ok(adminToken, 'seed admin sign-in failed');
  });

  after(async () => {
    if (syntheticUserId) await prisma.user.deleteMany({ where: { id: syntheticUserId } });
    await setSeedRole('USER');
  });

  test('admin endpoints reject forged/invalid tokens', async () => {
    const r = await api('/users', { token: 'forged-or-expired-token' });
    // Bad JWT -> auth middleware responds 403 (see requireAuth).
    assert.equal(r.status, 403, 'forged token must be rejected with 403');
  });

  test('non-admin valid token is rejected with 403 on every admin resource', async (t) => {
    for (const path of ['/users', '/llm', '/config', '/audit', '/dashboard']) {
      await t.test(path, async () => {
        const res = await api(path, { token: userToken });
        assert.equal(res.status, 403, `${path} should be 403 for a non-admin`);
      });
    }
  });

  test('LLM API key is never returned in plaintext', async () => {
    const secret = `sk-${RUN_ID}-very-secret-api-key-9f37ac`;
    const p = await api('/llm', {
      token: adminToken,
      method: 'POST',
      body: {
        provider: 'openai',
        label: `IT PROVIDER ${RUN_ID}`,
        defaultModel: 'gpt-4o-mini',
        apiKey: secret,
        accessRoles: ['ADMIN'],
      },
    });
    assert.equal(p.status, 201, `create failed: ${JSON.stringify(p.json)}`);
    const pid = p.json?.id;
    assert.ok(pid, 'provider should have an id');
    assert.ok(!JSON.stringify(p.json).includes(secret), 'create response must not contain plaintext key');
    assert.match(p.json?.apiKeyHint ?? '', /^sk-/, 'response should expose a masked hint');
    assert.notEqual(p.json?.apiKeyHint, secret);

    // Fetch it back — still masked, never leaked.
    const got = await api(`/llm/${pid}`, { token: adminToken });
    assert.ok(!JSON.stringify(got.json).includes(secret), 'GET must not leak the key');

    // Cleanup
    await api(`/llm/${pid}`, { token: adminToken, method: 'DELETE' });
  });

  test('secret config values are encrypted at rest and masked in responses', async () => {
    const key = `it_secret_${RUN_ID}`;
    const secret = `${RUN_ID}-super-secret-config-value`;
    const c = await api('/config', {
      token: adminToken,
      method: 'POST',
      body: { key, type: 'secret', value: secret, name: 'IT secret' },
    });
    assert.equal(c.status, 200, `config create failed: ${JSON.stringify(c.json)}`);
    assert.ok(!JSON.stringify(c.json).includes(secret), 'secret config must not be returned plaintext');

    const row = await prisma.systemConfig.findUnique({ where: { key } });
    assert.ok(row, 'config row should exist');
    assert.equal(row.encrypted, true, 'row must be flagged encrypted');
    assert.ok(row.valueString && !row.valueString.includes(secret), 'stored valueString must be ciphertext');
    assert.equal(row.valueString!.split(':').length, 3, 'valueString should be ciphertext:iv:tag');

    await prisma.systemConfig.deleteMany({ where: { key } });
  });

  test('deactivated account cannot use admin resources (403 on auth middleware)', async () => {
    const email = await uniqueEmail('deact');
    const created = await prisma.user.create({
      data: {
        firstName: 'Deact',
        lastName: 'User',
        phoneNumber: uniquePhone(),
        email,
        passwordHash: TEST_PASSWORD_HASH,
        role: 'USER',
        isActive: false,
      },
    });
    try {
      const token = await signin(email, TEST_PASSWORD);
      // Even if a token is issued at signin, the auth middleware must block it.
      const res = await api('/users', { token });
      assert.equal(res.status, 403, 'deactivated account token must be rejected');
    } finally {
      await prisma.user.deleteMany({ where: { id: created.id } });
    }
  });
});

describe('Admin API — Integration flows', () => {
  let adminToken: string | null = null;
  let testUserId: string | null = null;

  // ALWAYS re-promote and get a fresh token so this suite is self-contained.
  before(async () => {
    await setSeedRole('ADMIN');
    adminToken = await signin(SEED_EMAIL, SEED_PASS);
    assert.ok(adminToken, 'seed admin sign-in failed');
  });

  after(async () => {
    if (testUserId) await prisma.user.deleteMany({ where: { id: testUserId } });
    await setSeedRole('USER');
    await prisma.$disconnect().catch(() => {});
  });

  test('dashboard returns aggregate stats', async () => {
    const d = await api('/dashboard', { token: adminToken });
    assert.equal(d.status, 200);
    assert.equal(typeof d.json?.stats?.totalUsers, 'number');
    assert.equal(typeof d.json?.stats?.activeUsers, 'number');
    assert.ok(Array.isArray(d.json?.providers));
  });

  test('list users supports search + pagination', async () => {
    const u = await api('/users?page=1&pageSize=5', { token: adminToken });
    assert.equal(u.status, 200);
    assert.equal(typeof u.json?.total, 'number');
    assert.ok(Array.isArray(u.json?.items));
    assert.ok(u.json.items.length <= 5, 'pagination respected');
  });

  test('round-trip: create user, update role, bulk deactivate', async () => {
    const email = await uniqueEmail('user');
    const created = await api('/users', {
      token: adminToken,
      method: 'POST',
      body: {
        firstName: 'IT',
        lastName: 'User',
        phoneNumber: uniquePhone(),
        email,
        password: 'TempPass123!',
        role: 'USER',
      },
    });
    assert.equal(created.status, 201, `create failed: ${JSON.stringify(created.json)}`);
    const uid = created.json?.id;
    testUserId = uid;
    assert.ok(uid, 'created user should have an id');

    const updated = await api(`/users/${uid}`, {
      token: adminToken,
      method: 'PATCH',
      body: { role: 'SUBSCRIBER', tier: 'BASIC' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json?.role, 'SUBSCRIBER');

    const activity = await api(`/users/${uid}/activity`, { token: adminToken });
    assert.equal(activity.status, 200);

    const bulk = await api('/users/bulk-active', {
      token: adminToken,
      method: 'POST',
      body: { ids: [uid], active: false },
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.json?.count, 1);

    // The bulk-deactivated user must be blocked from authenticating downstream.
    const deactivatedToken = await signin(email, 'TempPass123!');
    const blocked = await api('/users', { token: deactivatedToken });
    assert.equal(blocked.status, 403, 'bulk-deactivated user must be rejected');
  });

  test('LLM provider usage metrics aggregate correctly', async () => {
    const usage = await api('/llm/usage?days=30', { token: adminToken });
    assert.equal(usage.status, 200);
    assert.equal(typeof usage.json?.totalCalls, 'number');
    assert.ok(Array.isArray(usage.json?.byModel));
  });

  test('config backup + restore round-trips a value', async () => {
    const key = `it_backup_${RUN_ID}`;
    await api('/config', {
      token: adminToken,
      method: 'POST',
      body: { key, type: 'number', value: 42, name: 'IT backup config' },
    });
    const backup = await api('/config/backup', { token: adminToken });
    assert.equal(backup.status, 200);
    assert.ok(Array.isArray(backup.json?.configs));

    await api(`/config/${key}`, { token: adminToken, method: 'DELETE' });
    const restore = await api('/config/restore', {
      token: adminToken,
      method: 'POST',
      body: {
        snapshot: { configs: backup.json.configs.filter((c: any) => c.key === key) },
        overwrite: true,
      },
    });
    assert.equal(restore.status, 200);
    assert.equal(restore.json?.imported, 1);

    const readBack = await api(`/config/${key}`, { token: adminToken });
    assert.equal(readBack.json?.value, 42);
    await prisma.systemConfig.deleteMany({ where: { key } });
  });

  test('audit log records admin mutations', async () => {
    const all = await api('/audit?limit=200', { token: adminToken });
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.json));
    assert.ok(all.json.length > 0, 'audit log should not be empty after mutations');
    // Security: audit meta must never carry plaintext API keys.
    assert.ok(
      (all.json as any[]).every((r) => r.meta === null || !JSON.stringify(r.meta).includes('sk-')),
      'audit meta must never contain plaintext API keys',
    );
  });

  test('admin can set a user active state', async () => {
    if (!testUserId) {
      const email = await uniqueEmail('user2');
      const created = await api('/users', {
        token: adminToken,
        method: 'POST',
        body: {
          firstName: 'IT',
          lastName: 'User2',
          phoneNumber: uniquePhone(),
          email,
          password: 'TempPass123!',
          role: 'USER',
        },
      });
      testUserId = created.json?.id;
    }
    const active = await api(`/users/${testUserId}/active`, {
      token: adminToken,
      method: 'PATCH',
      body: { active: true },
    });
    assert.equal(active.status, 200);
    assert.equal(active.json?.isActive, true);
  });
});