import { PrismaClient } from '@prisma/client';
import { writeAudit, contextFromRequest, AdminAction } from './audit.service.js';
import type { Request } from 'express';
import { encryptSecret, decryptSecret, maskKey } from '../../lib/secret.js';
import { invalidateProviderCache } from '../ai/llm.registry.js';

const prisma = new PrismaClient();

export const VALID_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;
export type ProviderId = (typeof VALID_PROVIDERS)[number];

export interface LlmProviderView {
  id: string;
  provider: ProviderId;
  label: string;
  baseUrl: string | null;
  isActive: boolean;
  priority: number;
  defaultModel: string;
  apiKeyHint: string | null;
  hasKey: boolean;
  accessRoles: string[];
  maxTokensLimit: number | null;
  extraJson: unknown;
  updatedByUserId: string | null;
  updatedAt: Date;
  createdAt: Date;
}

function toView(row: {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  isActive: boolean;
  priority: number;
  defaultModel: string;
  apiKeyHint: string | null;
  apiKeyEncrypted: string | null;
  accessRoles: unknown;
  maxTokensLimit: number | null;
  extraJson: unknown;
  updatedByUserId: string | null;
  updatedAt: Date;
  createdAt: Date;
}): LlmProviderView {
  return {
    id: row.id,
    provider: (row.provider as ProviderId) ?? 'openai',
    label: row.label,
    baseUrl: row.baseUrl,
    isActive: row.isActive,
    priority: row.priority,
    defaultModel: row.defaultModel,
    apiKeyHint: row.apiKeyHint ?? null,
    hasKey: Boolean(row.apiKeyEncrypted),
    accessRoles: Array.isArray(row.accessRoles) ? (row.accessRoles as string[]) : [],
    maxTokensLimit: row.maxTokensLimit ?? null,
    extraJson: row.extraJson ?? null,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export async function listProviders(req: Request): Promise<LlmProviderView[]> {
  const rows = await prisma.adminLlmProvider.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toView);
}

export async function getProvider(req: Request, id: string): Promise<LlmProviderView | null> {
  const row = await prisma.adminLlmProvider.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

export async function createProvider(
  req: Request,
  input: {
    provider: ProviderId;
    label: string;
    baseUrl?: string;
    defaultModel: string;
    apiKey?: string;
    accessRoles: string[];
    priority?: number;
    maxTokensLimit?: number;
    isActive?: boolean;
  },
): Promise<LlmProviderView> {
  const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
  const row = await prisma.adminLlmProvider.create({
    data: {
      provider: input.provider,
      label: input.label,
      baseUrl: input.baseUrl ?? null,
      defaultModel: input.defaultModel,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 100,
      accessRoles: input.accessRoles as unknown as object,
      maxTokensLimit: input.maxTokensLimit ?? null,
      ...(encrypted
        ? {
            apiKeyEncrypted: encrypted.ciphertext,
            apiKeyIv: encrypted.iv,
            apiKeyTag: encrypted.tag,
            apiKeyHint: maskKey(input.apiKey!),
          }
        : {}),
      updatedByUserId: (req.user as { sub?: string } | undefined)?.sub ?? null,
    },
  });
  await writeAudit({
    context: contextFromRequest(req),
    action: AdminAction.LLM_PROVIDER_CREATE,
    targetType: 'llm_provider',
    targetId: row.id,
    meta: { provider: input.provider, label: input.label, hasKey: Boolean(input.apiKey) },
  });
  invalidateProviderCache();
  return toView(row);
}

export async function updateProvider(
  req: Request,
  id: string,
  input: {
    label?: string;
    baseUrl?: string | null;
    defaultModel?: string;
    accessRoles?: string[];
    priority?: number;
    maxTokensLimit?: number | null;
    isActive?: boolean;
    apiKey?: string;
  },
): Promise<LlmProviderView> {
  const existing = await prisma.adminLlmProvider.findUnique({ where: { id } });
  if (!existing) throw new Error('Provider not found');

  const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
  const row = await prisma.adminLlmProvider.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl || null } : {}),
      ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
      ...(input.accessRoles !== undefined
        ? { accessRoles: input.accessRoles as unknown as object }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.maxTokensLimit !== undefined ? { maxTokensLimit: input.maxTokensLimit } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(encrypted
        ? {
            apiKeyEncrypted: encrypted.ciphertext,
            apiKeyIv: encrypted.iv,
            apiKeyTag: encrypted.tag,
            apiKeyHint: maskKey(input.apiKey!),
          }
        : {}),
      updatedByUserId: (req.user as { sub?: string } | undefined)?.sub ?? null,
    },
  });
  await writeAudit({
    context: contextFromRequest(req),
    action: AdminAction.LLM_PROVIDER_UPDATE,
    targetType: 'llm_provider',
    targetId: row.id,
    meta: {
      keyRotated: Boolean(input.apiKey),
      isActive: input.isActive,
      provider: row.provider,
    },
  });
  invalidateProviderCache();
  return toView(row);
}

export async function removeProvider(req: Request, id: string): Promise<void> {
  const existing = await prisma.adminLlmProvider.findUnique({ where: { id } });
  if (!existing) throw new Error('Provider not found');
  await prisma.adminLlmProvider.delete({ where: { id } });
  await writeAudit({
    context: contextFromRequest(req),
    action: AdminAction.LLM_PROVIDER_DELETE,
    targetType: 'llm_provider',
    targetId: id,
    meta: { provider: existing.provider, label: existing.label },
  });
  invalidateProviderCache();
}

/** Usage metrics per provider (from LlmCallAudit) for the dashboard. */
export async function providerUsage(req: Request, model?: string, days = 30): Promise<{
  totalCalls: number;
  totalTokens: number;
  totalCostDecimal: number;
  successRate: number;
  byModel: { model: string; calls: number; cost: number }[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.llmCallAudit.findMany({
    where: { createdAt: { gte: since }, ...(model ? { model } : {}) },
    select: { model: true, promptTokens: true, outputTokens: true, totalCostDecimal: true, success: true },
  });
  const byModel = new Map<string, { model: string; calls: number; tokens: number; cost: number; ok: number }>();
  for (const r of rows) {
    const key = r.model ?? 'unknown';
    const cur = byModel.get(key) ?? { model: key, calls: 0, tokens: 0, cost: 0, ok: 0 };
    cur.calls += 1;
    cur.tokens += r.promptTokens + r.outputTokens;
    cur.cost += r.totalCostDecimal ?? 0;
    if (r.success) cur.ok += 1;
    byModel.set(key, cur);
  }
  const totalCalls = rows.length;
  const totalTokens = rows.reduce((a, r) => a + r.promptTokens + r.outputTokens, 0);
  const totalCostDecimal = rows.reduce((a, r) => a + (r.totalCostDecimal ?? 0), 0);
  const ok = rows.filter((r) => r.success).length;
  return {
    totalCalls,
    totalTokens,
    totalCostDecimal,
    successRate: totalCalls ? (ok / totalCalls) * 100 : 0,
    byModel: [...byModel.values()].map((m) => ({ model: m.model, calls: m.calls, cost: m.cost })).sort((a, b) => b.calls - a.calls),
  };
}

/** Needed by the runtime registry — resolve the clear-text key for a provider row. */
export async function resolveApiKey(id: string): Promise<string | null> {
  const row = await prisma.adminLlmProvider.findUnique({ where: { id } });
  if (!row?.apiKeyEncrypted || !row.apiKeyIv || !row.apiKeyTag) return null;
  return decryptSecret({ ciphertext: row.apiKeyEncrypted, iv: row.apiKeyIv, tag: row.apiKeyTag });
}

export default { listProviders, createProvider, updateProvider, removeProvider, providerUsage, resolveApiKey };