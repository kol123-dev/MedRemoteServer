// Admin API smoke test (run with `tsx` from backend dir)
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE || 'http://localhost:8000';
const prisma = new PrismaClient();

async function api(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const { method = 'GET', token, body } = opts;
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function signin(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: email, password }),
  });
  const json: any = await res.json();
  return json?.accessToken ?? null;
}

async function main() {
  console.log('== Admin API smoke test ==');

  // 1. Non-admin must be rejected (403) — seed user john is BASIC/USER
  const userTok = await signin('john@kipruto.ke', 'MedRemote2026!').catch(() => null);
  if (userTok) {
    const r = await api('/users', { token: userTok });
    console.log(`[RBAC] non-admin GET /admin/users -> ${r.status} (expect 403)`, r.json?.error ?? '');
  } else {
    console.log('[RBAC] could not sign in seed user');
  }

  // 2. Promote john to ADMIN for testing (or find an existing admin)
  await prisma.user.updateMany({ where: { email: 'john@kipruto.ke' }, data: { role: 'ADMIN' } });
  const adminTok = await signin('john@kipruto.ke', 'MedRemote2026!');
  console.log('[SETUP] john promoted to ADMIN');

  // 3. Dashboard
  const d = await api('/dashboard', { token: adminTok });
  console.log(`[DASHBOARD] /admin/dashboard -> ${d.status}`, JSON.stringify(d.json?.stats ?? d.json?.error));

  // 4. Users list
  const u = await api('/users?page=1&pageSize=5', { token: adminTok });
  console.log(`[USERS] GET /admin/users -> ${u.status} total=${u.json?.total ?? u.json?.error}`);

  // 5. Create an LLM provider (openai) DB-managed
  const p = await api('/llm', {
    token: adminTok,
    method: 'POST',
    body: { provider: 'openai', label: 'OpenAI Admin Test', defaultModel: 'gpt-4o-mini', apiKey: 'sk-test-abc123', accessRoles: ['USER', 'SUBSCRIBER', 'ADMIN'], priority: 1 },
  });
  console.log(`[LLM] POST /admin/llm -> ${p.status}`, JSON.stringify(p.json?.apiKeyHint ?? p.json?.error));

  // 6. LLM usage
  const us = await api('/llm/usage?days=30', { token: adminTok });
  console.log(`[LLM-USAGE] GET /admin/llm/usage -> ${us.status} totalCalls=${us.json?.totalCalls ?? us.json?.error}`);

  // 7. Config upsert
  const c = await api('/config', {
    token: adminTok,
    method: 'POST',
    body: { key: 'maintenance_mode', name: 'Maintenance mode', type: 'boolean', value: false, isPublic: true },
  });
  console.log(`[CONFIG] POST /admin/config -> ${c.status}`, JSON.stringify(c.json?.key ?? c.json?.error));

  // 8. Config backup/restore
  const b = await api('/config/backup', { token: adminTok });
  console.log(`[CONFIG-BACKUP] GET /admin/config/backup -> ${b.status} configs=${b.json?.configs?.length ?? b.json?.error}`);

  // 9. Audit list
  const a = await api('/audit?limit=10', { token: adminTok });
  console.log(`[AUDIT] GET /admin/audit -> ${a.status} rows=${Array.isArray(a.json) ? a.json.length : a.json?.error}`);

  // cleanup: demote back
  await prisma.user.updateMany({ where: { email: 'john@kipruto.ke' }, data: { role: 'USER' } });
  // cleanup test provider
  if (p.json?.id) {
    await api(`/llm/${p.json.id}`, { token: adminTok, method: 'DELETE' });
    console.log('[CLEANUP] removed test LLM provider');
  }
  if (c.json?.id) {
    await prisma.systemConfig.deleteMany({ where: { key: 'maintenance_mode' } });
  }
  console.log('== done (john restored to USER) ==');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});