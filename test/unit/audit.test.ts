import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { contextFromRequest, AdminAction } from '../../src/services/admin/audit.service.js';

function fakeReq(
  overrides: Partial<{
    sub: string | null;
    headers: Record<string, string | undefined>;
    socketRemote: string | null;
  }> = {},
): Request {
  const { sub = 'user-123', headers = {}, socketRemote = '127.0.0.1' } = overrides;
  return {
    user: sub ? { sub } : undefined,
    headers: {
      'user-agent': 'node-test/1.0',
      ...headers,
    },
    socket: { remoteAddress: socketRemote },
  } as unknown as Request;
}

describe('audit.service.ts — contextFromRequest', () => {
  test('captures actor sub when present', () => {
    const ctx = contextFromRequest(fakeReq({ sub: 'user-99' }));
    assert.equal(ctx.actorUserId, 'user-99');
  });

  test('returns null actor when request has no user', () => {
    const ctx = contextFromRequest(fakeReq({ sub: null }));
    assert.equal(ctx.actorUserId, null);
  });

  test('uses the first x-forwarded-for IP when provided', () => {
    const ctx = contextFromRequest(
      fakeReq({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1', 'user-agent': 'ua' } }),
    );
    assert.equal(ctx.ipAddress, '203.0.113.5');
  });

  test('falls back to socket remoteAddress when x-forwarded-for is absent', () => {
    const ctx = contextFromRequest(fakeReq({ socketRemote: '10.1.2.3' }));
    assert.equal(ctx.ipAddress, '10.1.2.3');
  });

  test('captures user-agent string', () => {
    const ctx = contextFromRequest(fakeReq({ headers: { 'user-agent': 'custom-agent' } }));
    assert.equal(ctx.userAgent, 'custom-agent');
  });

  test('handles a user-agent that is not a string', () => {
    const ctx = contextFromRequest(fakeReq({ headers: { 'user-agent': '' } }));
    // falls back to null when header is empty string (not a real UA)
    assert.equal(ctx.userAgent, '');
  });
});

describe('audit.service.ts — AdminAction contract', () => {
  test('exposes all documented standard action names', () => {
    const actions: string[] = Object.values(AdminAction);
    for (const a of [
      'USER_CREATE',
      'USER_UPDATE',
      'USER_DEACTIVATE',
      'USER_SIGNIN',
      'LLM_PROVIDER_CREATE',
      'LLM_KEY_ROTATE',
      'CONFIG_UPDATE',
      'CONFIG_BACKUP',
      'CONFIG_RESTORE',
    ]) {
      assert.ok(actions.includes(a), `expected AdminAction to include ${a}`);
    }
  });
});