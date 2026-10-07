import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../../lib/secret.js';

const prisma = new PrismaClient();

export interface RuntimeProviderConfig {
  id: string; // AdminLlmProvider.id
  provider: 'openai' | 'anthropic' | 'gemini';
  label: string;
  defaultModel: string;
  apiKey: string | null;
  baseUrl: string | null;
  maxTokensLimit: number | null;
  extraJson: unknown;
  accessRoles: string[];
}

let cache: RuntimeProviderConfig[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 15_000; // refresh every 15s so admin changes take effect quickly

/** Loads active DB-managed providers (keys decrypted), cached briefly. */
export async function loadActiveProviders(): Promise<RuntimeProviderConfig[]> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const rows = await prisma.adminLlmProvider.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  cache = rows.map((r) => ({
    id: r.id,
    provider: r.provider as RuntimeProviderConfig['provider'],
    label: r.label,
    defaultModel: r.defaultModel,
    baseUrl: r.baseUrl,
    maxTokensLimit: r.maxTokensLimit,
    extraJson: r.extraJson,
    accessRoles: Array.isArray(r.accessRoles) ? (r.accessRoles as string[]) : [],
    apiKey:
      r.apiKeyEncrypted && r.apiKeyIv && r.apiKeyTag
        ? decryptSecret({ ciphertext: r.apiKeyEncrypted, iv: r.apiKeyIv, tag: r.apiKeyTag })
        : null,
  }));
  cacheLoadedAt = Date.now();
  return cache;
}

/** Force-refresh the cache (call after admin creates/updates/deletes a provider). */
export function invalidateProviderCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}

/**
 * Resolves the best DB-managed provider for a user role.
 * - Filters by accessRoles containing the role.
 * - Returns highest-priority (lowest `priority`) active provider with a key.
 * - Returns null when no DB provider applies (caller then falls back to env).
 */
export async function resolveDbProvider(opts: {
  role?: string;
  feature?: string;
}): Promise<RuntimeProviderConfig | null> {
  const providers = await loadActiveProviders();
  const role = opts.role ?? 'USER';
  const applicable = providers.filter(
    (p) =>
      p.apiKey &&
      (!p.accessRoles || p.accessRoles.length === 0 || p.accessRoles.includes(role)),
  );
  return applicable[0] ?? null;
}

export default { loadActiveProviders, resolveDbProvider, invalidateProviderCache };