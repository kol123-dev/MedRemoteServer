import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { IDEMPOTENCY_CACHE_TTL_SECONDS } from '../config/featureFlags.js';

interface CachedResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  expiresAt: number;
}

const cache = new Map<string, CachedResponse>();

let sweepStarted = false;
function startSweep(): void {
  if (sweepStarted) return;
  sweepStarted = true;
  const everyMs = Math.min(IDEMPOTENCY_CACHE_TTL_SECONDS, 60) * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt < now) cache.delete(k);
    }
  }, everyMs).unref();
}
startSweep();

const HEADER_NAME = 'x-idempotency-key';

export function idempotencyMiddleware(optIn = true): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.headers[HEADER_NAME];
    if (typeof key !== 'string' || key.length === 0) {
      if (optIn) { next(); return; }
      res.status(400).json({ error: `Missing header: ${HEADER_NAME}` });
      return;
    }
    if (key.length > 128) {
      res.status(400).json({ error: `${HEADER_NAME} too long (max 128)` });
      return;
    }
    const cacheKey = `${req.method}:${req.path}:${key as string}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.set(cached.headers);
      res.set('x-idempotency-hit', '1');
      res.status(cached.status).json(cached.body);
      return;
    }

    const origJson = res.json.bind(res);
    let patched = false;
    res.json = ((body: unknown) => {
      if (!patched && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        patched = true;
        const status = res.statusCode;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.getHeaders())) {
          if (typeof v === 'string') headers[k] = v;
        }
        cache.set(cacheKey, {
          status,
          body,
          headers,
          expiresAt: Date.now() + IDEMPOTENCY_CACHE_TTL_SECONDS * 1000,
        });
      }
      return origJson(body);
    }) as typeof res.json;

    next();
  };
}
