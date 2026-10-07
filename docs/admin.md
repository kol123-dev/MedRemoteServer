# MedRemote — Super User (Admin) Interface Reference

Production-ready, role-based administration center for MedRemote. This document is the
single source of truth for maintaining the admin interface: its features, every API
endpoint, the data model, security controls, configuration options, and how to run the
test suite.

> Frontend: `frontend/app/admin/**` (Next.js App Router)
> Backend: `backend/src/{routes,controllers,services}/admin/**`
> Schema: `backend/prisma/schema.prisma` (models `AdminLlmProvider`, `SystemConfig`,
> `AdminAuditLog`, plus `User.isActive`)

---

## 1. Access Control (RBAC / Security)

- All admin routes live under `/api/admin/**` and require **both** `requireAuth()` (a valid
  JWT) **and** `requireRole('ADMIN')`.
- `Role` enum: `USER | SUBSCRIBER | ADMIN`. **ADMIN currently acts as the super-user role.**
  To grant super-admin, an existing ADMIN promotes the account's `role` to `ADMIN`.
- Non-admin valid tokens → `403 Role insufficient`. Forged/expired tokens → `403`.
- Deactivated accounts (`User.isActive = false`) are rejected by the auth middleware with
  `403 Account deactivated` on **every** request, including admin.
- The frontend gate lives in [frontend/app/admin/layout.tsx](file:///c:/Users/conta/Desktop/TESLA%20K/INFINIA%20SYNC/MedRemote/frontend/app/admin/layout.tsx): any non-ADMIN user is
  redirected to `/dashboard`.

### Secrets at rest
LLM API keys and `secret`-typed config values are encrypted with **AES-256-GCM** before
persistence (`backend/src/lib/secret.ts`). The ciphertext, IV and auth tag are stored in
separate columns (LLM) or as a `ciphertext:iv:tag` string (config). The API only ever
returns a masked hint (`sk-ant…1QAA`) — never plaintext or ciphertext.

The AES key comes from `SECRETS_ENCRYPTION_KEY` (must be ≥ 32 chars). **In production this
must be a strong, unique, non-default value** and kept out of source control.

### Audit logging
Every mutation (user create/update/deactivate, LLM provider create/update/delete, config
create/update/delete/backup/restore) and every successful sign-in writes an
`AdminAuditLog` row via `backend/src/services/admin/audit.service.ts`. Audit writes are
fire-and-forget — a failure to log never breaks the primary operation. Standard action
names are enumerated in the `AdminAction` const.

---

## 2. Endpoints

Base path: `/api/admin`. All require an ADMIN bearer token.

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Aggregate stats (`totalUsers`, `activeUsers`, `providers`, `auditCount`), provider list, and 30-day LLM usage. |

### Audit logs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit?limit=&action=&actorUserId=&targetType=` | Query audit rows (`limit` 1–200, default 50). |
| GET | `/audit/:id` | (Single-row shape reserved; currently same as list.) |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users?search=&role=&tier=&active=&page=&pageSize=` | Paginated list. `active` is `true`/`false`. `pageSize` ≤ 100. |
| GET | `/users/:id` | Full user detail. |
| GET | `/users/:id/activity` | Session/activity history for a user. |
| POST | `/users` | Create a user. Body: `firstName`, `lastName`, `phoneNumber`, `email?`, `password` (≥ 8), `role`. |
| PATCH | `/users/:id` | Update a user. Any subset of `firstName`, `lastName`, `email`, `phoneNumber`, `role`, `tier`, `password`. |
| PATCH | `/users/:id/active` | Body `{ active: boolean }` → activate/deactivate a single user. |
| POST | `/users/bulk-active` | Body `{ ids: string[], active: boolean }` → bulk activate/deactivate (1–200 ids). |

### LLM providers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/llm` | List configured providers (ordered by `priority` asc). |
| GET | `/llm/usage?model=&days=` | Usage metrics (`totalCalls`, `totalTokens`, `totalCostDecimal`, `successRate`, `byModel[]`). |
| GET | `/llm/:id` | A single provider (key always masked). |
| POST | `/llm` | Create. Body: `provider` (`openai`\|`anthropic`\|`gemini`), `label`, `defaultModel`, `apiKey?`, `baseUrl?`, `accessRoles[]`, `priority?`, `maxTokensLimit?`, `isActive?`. |
| PATCH | `/llm/:id` | Update any subset above; supplying `apiKey` rotates the key. |
| DELETE | `/llm/:id` | Remove a provider. |

### System config
| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | List all config keys (secrets masked). |
| GET | `/config/:key` | A single config value (secrets masked). |
| POST | `/config` | Create. Body: `key`, `name`, `type` (`string`\|`number`\|`boolean`\|`json`\|`secret`), `value`, `description?`, `isPublic?`, `isEditable?`. |
| PATCH | `/config/:key` | Update an existing key. |
| DELETE | `/config/:key` | Delete a key. |
| GET | `/config/backup` | Export all config as a JSON snapshot. |
| POST | `/config/restore` | Body `{ snapshot: { configs: [...] }, overwrite? }` → restore a backup. With `overwrite: false`, existing keys are skipped. |

---

## 3. Data Model (Prisma)

```prisma
model AdminLlmProvider {
  id             String   @id @default(cuid())
  provider       String   // openai | anthropic | gemini
  label          String
  baseUrl        String?
  isActive       Boolean  @default(true)
  priority       Int      @default(100)   // lower = used first
  defaultModel   String
  apiKeyEncrypted String?
  apiKeyIv       String?
  apiKeyTag      String?
  apiKeyHint     String?                  // masked preview only
  accessRoles    Json                     // e.g. ["USER","SUBSCRIBER","ADMIN"]
  maxTokensLimit Int?
  extraJson      Json?
  updatedByUserId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([provider, isActive])
  @@index([priority])
}

model SystemConfig {
  id            String   @id @default(cuid())
  key           String   @unique
  name          String
  description   String?
  type          String   // string | number | boolean | json | secret
  valueJson     Json?
  valueString   String?  // for secret: "ciphertext:iv:tag"
  encrypted     Boolean  @default(false)
  isPublic      Boolean  @default(false)
  isEditable    Boolean  @default(true)
  updatedByUserId String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AdminAuditLog {
  id           String   @id @default(cuid())
  actorUserId  String?
  action       String
  targetType   String?
  targetId     String?
  meta         Json?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())
  @@index([actorUserId, createdAt])
  @@index([action, createdAt])
}
```

`User` gained one additive field: `isActive Boolean @default(true)` (soft-deactivate). This
is a backward-compatible addition.

---

## 4. Runtime LLM Provider Resolution

The registry (`backend/src/services/ai/llm.registry.ts`) reads **active** `AdminLlmProvider`
rows, decrypts their keys, and caches them for 15 s. `aiComplete()` resolves a provider by
the requesting user's role (`resolveDbProvider({ role })`), preferring:

1. The highest-`priority` active DB provider whose `accessRoles` includes the user's role.
   (An empty `accessRoles` array matches any role.)
2. Falling back to the environment-configured provider (`LLM_PROVIDER`).

The registry cache is invalidated automatically whenever a provider is created/updated/
deleted through the admin API.

---

## 5. Environment / Configuration

Backend env vars relevant to the admin system:

| Variable | Required | Notes |
|----------|----------|-------|
| `SECRETS_ENCRYPTION_KEY` | Yes* | ≥ 32 chars. AES-256-GCM key for secrets stored by the admin UI. Must be unique/strong in production. |
| `LLM_PROVIDER` | No | `openai` \| `anthropic` \| `gemini` \| `mock` \| `auto`. Default provider when no DB provider matches. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | No | Env fallback OpenAI. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | No | Env fallback Claude (default `claude-sonnet-5-5`). Note: thinking models reject a `temperature` param — it is omitted automatically. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | No | Env fallback Gemini. |

\* Has a documented dev default; **must** be overridden for production deployments.

---

## 6. Frontend Pages

| Route | Purpose |
|-------|---------|
| `/admin` | Overview dashboard: stat cards + LLM usage strip + recent audit. |
| `/admin/users` | Searchable, filterable, paginated user table with inline edit, active toggle, bulk deactivate. |
| `/admin/llm` | Provider list, add/edit form (password-style key input, role access chips, priority), per-model usage breakdown. |
| `/admin/config` | Config table, add/edit with typed values, export/download and import/restore. |
| `/admin/audit` | Audit table with action filter and row-limit select. |

All pages are mobile-responsive (the shell uses a top-right drawer/hamburger on small
screens, per project convention). Non-ADMIN users are barred from `/admin`.

Reusable building blocks: `frontend/components/Feedback.tsx` (inline success/error) and the
typed admin client helpers in `frontend/lib/api.ts` (`adminFetch`, `adminListUsers`,
`adminCreateLlm`, `adminUpsertConfig`, `adminAuditLogs`, …).

---

## 7. Testing

Tests use Node's built-in test runner (`node:test`) executed through `tsx` — no extra
dependencies. Unit tests are DB-free; integration/security tests hit a **running backend**
(`npm run dev`) and a live database.

```bash
cd backend

npm run test:unit          # node:test on test/unit/**      (secret + audit)
npm run test:integration   # node:test on test/integration/** (RBAC + flows + security)
npm run test:smoke         # tsx scripts/admin-smoke.ts      (quick scripted smoke)
npm run test               # unit tests only
```

`test:integration` requires `API_BASE` (default `http://localhost:8000`) and the seed user
`john@kipruto.ke` / `MedRemote2026!`. It temporarily elevates that seed user to `ADMIN`,
exercises the admin API end-to-end, and restores the role afterwards.

### What the tests cover
- **Unit** — AES-256-GCM round-trip, tamper-evidence, `maskKey`; audit request-context extraction.
- **Security** — forged-token rejection; non-admin 403 across all resources; LLM key never
  returned in plaintext; secret config encrypted at rest and masked; deactivated account blocked.
- **Integration** — dashboard stats; paginated user list; user create/update/bulk-deactivate;
  LLM usage metrics; config backup/restore round-trip; audit log writes; active-state toggle.

---

## 8. Operations Checklist

- [ ] Set a strong, unique `SECRETS_ENCRYPTION_KEY` in production.
- [ ] Promote exactly the intended operators to `ADMIN`.
- [ ] Store all LLM keys through the admin UI (never `.env` only) for DB-managed provider switching.
- [ ] Review `/api/admin/audit` regularly; all admin actions are logged.
- [ ] Back up `/api/admin/config/backup` before schema or feature-flag changes.