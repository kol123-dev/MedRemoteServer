import { PrismaClient, Prisma } from '@prisma/client';
import { writeAudit, contextFromRequest, AdminAction } from './audit.service.js';
import type { Request } from 'express';
import { encryptSecret, decryptSecret } from '../../lib/secret.js';

const prisma = new PrismaClient();

export const CONFIG_TYPES = ['string', 'number', 'boolean', 'json', 'secret'] as const;
export type ConfigType = (typeof CONFIG_TYPES)[number];

export interface ConfigView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: ConfigType;
  value: string | number | boolean | Record<string, unknown> | unknown[] | null;
  encrypted: boolean;
  isPublic: boolean;
  isEditable: boolean;
  updatedByUserId: string | null;
  updatedAt: Date;
  createdAt: Date;
}

function decryptIfNeeded(row: {
  encrypted: boolean;
  type: ConfigType;
  valueString: string | null;
  valueJson: unknown;
}): string | null {
  if (row.encrypted && row.valueString) {
    try {
      const parts = row.valueString.split(':');
      if (parts.length === 3) {
        return decryptSecret({
          ciphertext: parts[0]!,
          iv: parts[1]!,
          tag: parts[2]!,
        });
      }
    } catch {
      return null;
    }
  }
  return row.valueString;
}

function toView(row: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: string;
  valueString: string | null;
  valueJson: unknown;
  encrypted: boolean;
  isPublic: boolean;
  isEditable: boolean;
  updatedByUserId: string | null;
  updatedAt: Date;
  createdAt: Date;
}): ConfigView {
  const type = (row.type as ConfigType) ?? 'string';
  let value: string | number | boolean | Record<string, unknown> | unknown[] | null = null;
  if (type === 'secret' || type === 'string') {
    value = decryptIfNeeded(row as never);
  } else if (type === 'number') {
    value = row.valueString ? Number(row.valueString) : Number(row.valueJson ?? 0);
  } else if (type === 'boolean') {
    value = row.valueString === 'true' || row.valueJson === true;
  } else {
    value = row.valueJson as Record<string, unknown> | unknown[] | null;
  }
  // Mask secret values unless explicitly requested to reveal (security default).
  if (type === 'secret' && value && row.updatedAt) {
    const s = String(value);
    value = s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : '••••';
  }
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    type,
    value,
    encrypted: row.encrypted,
    isPublic: row.isPublic,
    isEditable: row.isEditable,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export async function listConfig(req: Request): Promise<ConfigView[]> {
  const rows = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
  return rows.map(toView);
}

export async function getConfigKey(req: Request, key: string): Promise<ConfigView | null> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  return row ? toView(row) : null;
}

function serializeValue(type: ConfigType, value: string | number | boolean | Record<string, unknown> | unknown[] | null): {
  valueString?: string;
  valueJson?: Prisma.InputJsonValue;
  encrypted?: boolean;
} {
  if (type === 'secret') {
    const plaintext = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    const enc = encryptSecret(plaintext);
    const combined = `${enc.ciphertext}:${enc.iv}:${enc.tag}`;
    return { valueString: combined, encrypted: true };
  }
  if (type === 'json') {
    return { valueJson: value as Prisma.InputJsonValue };
  }
  if (type === 'number') {
    return { valueString: String(Number(value ?? 0)) };
  }
  if (type === 'boolean') {
    return { valueString: value === true || value === 'true' ? 'true' : 'false' };
  }
  // string
  return { valueString: typeof value === 'string' ? value : String(value ?? '') };
}

export async function upsertConfig(
  req: Request,
  input: {
    key: string;
    name?: string;
    description?: string;
    type: ConfigType;
    value: string | number | boolean | Record<string, unknown> | unknown[] | null;
    isPublic?: boolean;
    isEditable?: boolean;
  },
): Promise<ConfigView> {
  const existing = await prisma.systemConfig.findUnique({ where: { key: input.key } });
  const serialized = serializeValue(input.type, input.value);
  const actor = (req.user as { sub?: string } | undefined)?.sub ?? null;

  const row = existing
    ? await prisma.systemConfig.update({
        where: { key: input.key },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          type: input.type,
          ...serialized,
          isPublic: input.isPublic ?? existing.isPublic,
          isEditable: input.isEditable ?? existing.isEditable,
          updatedByUserId: actor,
        },
      })
    : await prisma.systemConfig.create({
        data: {
          key: input.key,
          name: input.name ?? input.key,
          description: input.description ?? null,
          type: input.type,
          ...serialized,
          isPublic: input.isPublic ?? false,
          isEditable: input.isEditable ?? true,
          updatedByUserId: actor,
        },
      });

  await writeAudit({
    context: contextFromRequest(req),
    action: existing ? AdminAction.CONFIG_UPDATE : AdminAction.CONFIG_CREATE,
    targetType: 'system_config',
    targetId: row.id,
    meta: { key: input.key, type: input.type },
  });
  return toView(row);
}

export async function deleteConfig(req: Request, key: string): Promise<void> {
  await prisma.systemConfig.delete({ where: { key } });
  await writeAudit({
    context: contextFromRequest(req),
    action: AdminAction.CONFIG_DELETE,
    targetType: 'system_config',
    meta: { key },
  });
}

/** Export an encrypted config backup (excluding nothing; secrets stay encrypted). */
export async function backupConfig(req: Request): Promise<{
  exportedAt: string;
  version: number;
  configs: ConfigView[];
}> {
  const rows = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
  await writeAudit({ context: contextFromRequest(req), action: AdminAction.CONFIG_BACKUP });
  return { exportedAt: new Date().toISOString(), version: 1, configs: rows.map(toView) };
}

export async function restoreConfig(
  req: Request,
  snapshot: { configs: ConfigView[] },
  opts: { overwrite: boolean },
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  const actor = (req.user as { sub?: string } | undefined)?.sub ?? null;
  for (const c of snapshot.configs) {
    const existing = await prisma.systemConfig.findUnique({ where: { key: c.key } });
    if (existing && !opts.overwrite) {
      skipped += 1;
      continue;
    }
    const serialized = serializeValue(c.type, c.value);
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: { name: c.name, description: c.description, type: c.type, ...serialized, updatedByUserId: actor },
      create: { key: c.key, name: c.name, description: c.description, type: c.type, ...serialized, isPublic: c.isPublic, isEditable: c.isEditable, updatedByUserId: actor },
    });
    imported += 1;
  }
  await writeAudit({
    context: contextFromRequest(req),
    action: AdminAction.CONFIG_RESTORE,
    targetType: 'system_config',
    meta: { imported, skipped, overwrite: opts.overwrite },
  });
  return { imported, skipped };
}

export default { listConfig, upsertConfig, deleteConfig, backupConfig, restoreConfig };