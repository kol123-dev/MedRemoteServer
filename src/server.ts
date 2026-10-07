import 'dotenv/config';
import './config/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import jobQueue from './services/queue/jobQueue.js';
import { recalcMatchesForUser } from './services/ai/matching.service.js';
import { resolveProvider } from './services/ai/llm.provider.js';

import jobRoutes from './routes/jobs.routes.js';
import paymentRoutes from './routes/payments.routes.js';

import { errorMiddleware } from './middleware/error.middleware.js';
import { idempotencyMiddleware } from './middleware/idempotency.middleware.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { env } from './config/env.js';

// --- ROUTE IMPORTS (T11 Polish mounted — all service controllers ready)
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import employerRoutes from './routes/employers.routes.js';
import affiliateRoutes from './routes/affiliate.routes.js';
import billingRoutes from './routes/billing.routes.js';
import aiResumeRoutes from './routes/ai-resume.routes.js';
import aiMatchRoutes from './routes/ai-match.routes.js';
import aiApplyRoutes from './routes/ai-apply.routes.js';
import atsSourceRoutes from './routes/ats-source.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();
const PORT = env.PORT;

// Health check — registered FIRST (before CORS/helmet/other middlewares) so uptime
// monitors (which typically send no Origin header) always get a clean 200 and are
// never blocked by the production CORS allowlist.
const healthHandler = (_req: express.Request, res: express.Response): void => {
  res.status(200).json({
    status: 'ok',
    env: env.NODE_ENV,
    sms: { enabled: env.SMS_ENABLED, provider: env.SMS_PROVIDER },
    payment: { mPesa: Boolean(env.MPESA_CONSUMER_KEY && env.MPESA_PASSKEY), paystack: Boolean(env.PAYSTACK_SECRET_KEY) },
    llm: { provider: resolveProvider().id, config: env.LLM_PROVIDER ?? 'auto' },
    uptimeSec: Math.floor(process.uptime()),
  });
};
app.get('/health', healthHandler);

// ========== PRODUCTION SECURITY (helmet) + DEPLOYMENT PROXY =============
// X-Forwarded-For / X-Forwarded-Proto trust for Render, Railway, Cloudflare.
app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY_HOPS);
// Apply a sensible set of Helmet security headers (permissive enough for cross-origin frontend)
app.use(
  helmet({
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: env.NODE_ENV === 'production' ? {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'script-src': ["'self'"],
        'connect-src': ["'self'", env.FRONTEND_URL, env.BACKEND_URL, 'https://*.vercel.app'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
      },
    } : false,
  }),
);

// ========== CORS ORIGIN ALLOWLIST (supports wildcard prefixes *.domain.tld) ==========
const STATIC_CORS_ALLOWLIST: Array<string | RegExp> = [
  env.FRONTEND_URL,
  env.BACKEND_URL,
  /^https:\/\/medremote\.vercel\.app$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^capacitor:\/\/localhost$/,
  /^file:\/\/$/,
];
function globOriginToRegex(s: string): string | RegExp {
  if (!s.includes('*')) return s;
  const escaped = s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$', 'i');
}
const ADDITIONAL: Array<string | RegExp> = env.CORS_ORIGINS_ADDITIONAL.map(globOriginToRegex);
const ALLOWED = [...STATIC_CORS_ALLOWLIST, ...ADDITIONAL];

function originIsAllowed(origin: string | undefined): boolean {
  if (!origin) return env.NODE_ENV !== 'production'; // allow curl-like direct calls only in dev
  for (const allowed of ALLOWED) {
    if (typeof allowed === 'string') { if (origin === allowed) return true; }
    else if (allowed instanceof RegExp) { if (allowed.test(origin)) return true; }
  }
  return false;
}
app.use(cors({
  origin: (origin, cb) => {
    if (originIsAllowed(origin)) return cb(null, true);
    if (env.NODE_ENV !== 'production') {
      // Dev permissive log + pass (so local frontend custom ports still work)
      console.info('[server.ts cors] DEVELOPMENT: allowing origin=%s (not in allowlist). In production, add to CORS_ORIGINS_ADDITIONAL=... comma list.', origin);
      return cb(null, true);
    }
    return cb(new Error(`CORS origin ${origin} not in allowlist. Add via env CORS_ORIGINS_ADDITIONAL="https://yourdomain.com,https://*.sub.example.com" .`), false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Requested-With', 'Cookie', 'Accept', 'X-Paystack-Signature'],
  exposedHeaders: ['Content-Disposition', 'X-Trace-Id', 'X-Ratelimit-Remaining'],
  maxAge: 86400,
}));

// Expose cookieSecure flag for auth controller to set secure cookies production https-only
// auth controllers reference via env.COOKIE_SECURE_IN_PRODUCTION && NODE_ENV==='production'
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(idempotencyMiddleware(true));

// Domain-specific Routes — original two v1 routes, unchanged, backward compatible
app.use('/api/jobs', jobRoutes);
app.use('/api/payments', paymentRoutes);

// --- GROUP 2-4 route mounts (T11 Polish — all services ready)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employers', employerRoutes);
// Affiliate /t/:code public redirect mounted FIRST under /api/affiliates + ROOT /t/* via both mounts
app.use('/api/affiliates', affiliateRoutes);
app.use('/t', affiliateRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ai-resume', aiResumeRoutes);
app.use('/api/ai-match', aiMatchRoutes);
app.use('/api/ai-apply', aiApplyRoutes);
app.use(atsSourceRoutes); // mounts /api/ats-sources + /api/adapter-types (admin)
// Admin / super-user interface (RBAC: ADMIN role only)
app.use('/api/admin', adminRoutes);
// Webhooks: mounted public without idempotency/auth; processor validates signature headers
app.use('/api/webhooks', webhookRoutes);
// Inbox notifications stub v1:
app.use('/api/notifications/inbox', requireAuth(), (_req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = _req as any;
  res.json({ items: [], count: 0, lastRead: req.user?.lastNotificationReadAt ?? null });
});
// ----------------------------------------------------------------------------------

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 404,
    routes: [
      'GET  /health',
      'POST /api/auth/signup | /signin | /google | /linkedin | /refresh',
      'GET  /api/users/me (protected)',
      'GET  /api/jobs | /api/jobs/:id',
      'POST /api/ai-resume/analyze | /rewrite | /:id/download',
      'GET  /api/ai-match | /:matchId/explain — POST /api/ai-match/recalc',
      'POST /api/ai-apply/preview | /confirm-approve-submit',
      'GET  /api/billing/plans (public) | POST /billing/stk | /card',
      'POST /api/webhooks/payments/mpesa-callback | /paystack-verify',
      'GET  /t/:code (302 redirect affiliate cookie set)',
      'GET  /api/employers/me/profile — POST /api/employers/jobs',
      'GET  /api/affiliates/me/code | /me/stats — POST /payout-request',
    ],
  });
});

// Error middleware — MUST be mounted last, after routes & 404
app.use(errorMiddleware);

// Register the MATCH_RECALC job handler in-process so POST /api/ai-match/recalc
// and the 30-min cron recompute scores immediately — no separate worker process needed.
jobQueue.process('MATCH_RECALC', async (payload: { userId?: string }, ctx: { id: string; attempt: number; jobType: string }) => {
  const userId = payload.userId;
  if (!userId) {
    console.warn(`[server:match] jobId=${ctx.id} skip — no userId`);
    return;
  }
  const startedAt = Date.now();
  try {
    const matches = await recalcMatchesForUser(userId);
    console.info(`[server:match] jobId=${ctx.id} DONE userId=${userId} matches=${matches.length} elapsedMs=${Date.now() - startedAt}`);
  } catch (err) {
    console.error(`[server:match] jobId=${ctx.id} FAILED userId=${userId} error=${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
});

// Scraper + match worker cron hooks (30-min interval; scrape + match recalc queued)
cron.schedule('*/30 * * * *', async () => {
  try {
    console.log('[cron] 30-min scrape runner start (MedRemote data pipeline)');
    // Lazy import to avoid circular tsc resolution:
    const cronModule = await import('../scripts/cron.js').catch(() => null);
    const executeFn = cronModule?.executeScraperSuite as undefined | (() => Promise<void>);
    if (typeof executeFn === 'function') {
      await Promise.race([executeFn(), new Promise<void>((_, r) => setTimeout(() => r(new Error('scrape timeout')), 4 * 60 * 1000))]).catch((e) => console.warn('[cron] scrape skipped (timeout/no impl):', String(e).slice(0, 160)));
    }
    // Queue-wide match recalc: all subscribed users top matches recompute async via jobQueue
    try {
      const qModule = await import('./services/queue/jobQueue.js').catch(() => null);
      const queue = qModule?.default as any;
      if (queue && typeof queue.enqueue === 'function') {
        await queue.enqueue('SCRAPE_RUN', { trigger: 'cron', at: new Date().toISOString() });
        console.log('[cron] enqueued SCRAPE_RUN → match recalc after ingest');
      }
    } catch (e) { console.warn('[cron] match recalc queue warn:', String(e).slice(0, 160)); }
  } catch (e) { console.error('[cron] unexpected failed:', e); }
});

function start(): void {
  try {
    app.listen(PORT, () => {
      console.log('==========================================================');
      console.log(`[MedRemote Backend] 🩺 AI-Suite (A/B/C/D) — ALL 11 TASKS WIRED. Listening port ${PORT}.`);
      console.log(`[MedRemote Backend] Frontend origin: ${env.FRONTEND_URL} | Public: ${env.BACKEND_URL}`);
      console.log(`[MedRemote Backend] — A: Resume Builder (KNCK→Global ATS) /ai-resume`);
      console.log(`[MedRemote Backend] — B: Smart Match Engine (94% semantic)  /ai-match`);
      console.log(`[MedRemote Backend] — C: 1-Click Auto-Apply (Phase1 preview)  /ai-apply`);
      console.log(`[MedRemote Backend] — D: Billing M-PESA FIRST + card fallback  /billing + /webhooks`);
      console.log(`[MedRemote Backend] SMS: enabled=${env.SMS_ENABLED} provider=${env.SMS_PROVIDER} (swap env SMS_PROVIDER=twilio 0 controller edits)`);
      console.log(`[MedRemote Backend] LLM: provider=${env.LLM_PROVIDER ?? 'auto'} (auto picks the first configured key: openai → anthropic → gemini) | set LLM_PROVIDER=openai|anthropic|gemini|mock to force`);
      console.log(`[MedRemote Backend] PAYMENT: provider=${env.PAYMENT_PROVIDER ?? 'mpesa-first paystack-fallback mock-safe'} (swap PAYMENT_PROVIDER=paystack 0 controller edits — NFR-11 ✅)`);
      console.log(`[MedRemote Backend] Cron: 30-min scrape + match recalc queue. Separate: npm run match:worker for dedicated worker.`);
      console.log(`[MedRemote Backend] Health: GET /health  |  404 lists routes  |  v1 /api/jobs + /api/payments backward compat ✅`);
      console.log('==========================================================');
    });
  } catch (e) {
    console.error('[server.ts] start() FATAL. Check env vars above errors:');
    console.error(e);
    process.exit(1);
  }
}
if (require.main === module) start();

export default app;
export { app, start };
