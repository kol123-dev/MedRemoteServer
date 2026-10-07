# MedRemote Backend

Express 5 + Prisma 5 + TypeScript. Backend for **MedRemote AI Suite** (A. Kenyan→US ATS Resume Builder, B. Match Engine 94% scores, C. 1-Click Auto-Apply, D. M-Pesa FIRST Monetization + Paystack Card Fallback + Africa's Talking SMS Pluggable).

Frontend (Next.js 14 App Router): `../frontend/`. Deployed: https://medremote.vercel.app

## Quickstart

```bash
cd backend

# 1. Env
cp .env.example .env
# Edit .env: fill DATABASE_URL, JWT_SECRET, MPESA_*, OPENAI_API_KEY at minimum.
# SMS_ENABLED=false default = no real Africa's Talking SMS (sends to console).

# 2. Install (downgrades Prisma/TS RC from 7/6.x → 5.x stable)
npm install

# 3. Database
npx prisma migrate dev          # Creates tables + runs 0000_init_ai migration
npx prisma db seed              # Seeds 1 user, 30 jobs, 6 matches, 2 apps, 1 affiliate
npx prisma generate

# 4. Run (watch mode via tsx)
npm run dev                      # http://localhost:8000
npm run build && npm start       # Prod → dist/
```

## Architecture

```
HTTP Request
  │
  ▼
routes/*                 → thin mount + auth/zod middleware apply
  │
  ▼
controllers/*            → validate params, attach req.user, HTTP status codes
  │
  ▼
services/* / services/ai/* / services/payments/* / services/sms/*
  │  100% of business logic lives here.
  │  Cross-boundary ONLY via exported public symbols + jobQueue + prisma reads.
  │  NEVER import another service's sub-file.
  │
  ├─► Prisma Client (MySQL)
  ├─► services/ai/llm.provider.ts       [Pluggable: OpenAI | AnthropicStub | Mock]
  ├─► services/payments/payment.provider.ts [Pluggable: M-Pesa Daraja → Paystack → Promo]
  └─► services/sms/sms.provider.ts          [Pluggable: Africa's Talking → Twilio → Log]
```

**Provider swap = 1 env var. 0 controller edits.**
- LLM: `featureFlags.DEFAULT_LLM_PROVIDER`
- Payment primary already = M-Pesa (always first). Fallback card = Paystack (edit `resolveProvider` default or env).
- **SMS swap (user-requested):** Want Twilio instead of Africa's Talking? → `SMS_PROVIDER=twilio` + fill Twilio env. Done. Code in services never imports africastalking — only `import { sendSms } from '@/services/sms/sms.provider'`.

## Quick curl smoke (after seed)

```bash
# 1) Signup John Kipruto demo user seeded? Already has tier BASIC via seed.
TOKEN=$(curl -s -X POST localhost:8000/api/auth/signin \
  -H 'content-type: application/json' \
  -d '{"emailOrPhone":"john@kipruto.ke","password":"MedRemote2026!"}' | jq -r .token)

# 2) Feature A — Analyze resume (free tier works)
curl -s -X POST localhost:8000/api/ai/resume/analyze \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"rawResumeText":"KNCK Registered Nurse 6 years, TVET Diploma Nursing"}' | jq

# 3) Feature B — Top 94% matches
curl -s localhost:8000/api/ai/matches -H "Authorization: Bearer $TOKEN" | jq '.[0:3] | .[], .overallPct, .skillBreakdown'

# 4) Feature C — 1-Click Apply preview → confirm
curl -s -X POST localhost:8000/api/ai/applications -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"jobId":"SEE-seeded-job-uuid"}' | jq

# 5) Feature D — Pricing (M-Pesa first, public no auth)
curl -s localhost:8000/api/billing/pricing | jq '.[] | {tier:.id, KES:.priceKES, providers:.paymentProviders}'
# → returns paymentProviders[0] always === "mpesa"
```

## Tier Caps (FREE / BASIC=$5 / PREMIUM=$15 / LIFETIME=$199)

| Tier   | Rewrites/mo | Match recalc | 1-Click Applies |
|--------|-------------|--------------|-----------------|
| FREE   | 0           | 10/day       | 0               |
| BASIC  | 10          | 100/mo       | 30/mo           |
| PREMIUM| unlimited   | unlimited    | 200/mo          |

SMS renewal reminders: gated `SMS_ENABLED=false` default to avoid accidental spend.
