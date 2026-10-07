import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';

const prisma = new PrismaClient();

export interface AuditContext {
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Standard action names — keep in sync with admin UI / docs. */
export const AdminAction = {
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_UPDATE_ROLE: 'USER_UPDATE_ROLE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_ACTIVATE: 'USER_ACTIVATE',
  USER_SIGNIN: 'USER_SIGNIN',

  LLM_PROVIDER_CREATE: 'LLM_PROVIDER_CREATE',
  LLM_PROVIDER_UPDATE: 'LLM_PROVIDER_UPDATE',
  LLM_PROVIDER_DELETE: 'LLM_PROVIDER_DELETE',
  LLM_PROVIDER_TOGGLE: 'LLM_PROVIDER_TOGGLE',
  LLM_KEY_ROTATE: 'LLM_KEY_ROTATE',

  CONFIG_UPDATE: 'CONFIG_UPDATE',
  CONFIG_CREATE: 'CONFIG_CREATE',
  CONFIG_DELETE: 'CONFIG_DELETE',
  CONFIG_BACKUP: 'CONFIG_BACKUP',
  CONFIG_RESTORE: 'CONFIG_RESTORE',

  JOB_UPDATE: 'JOB_UPDATE',
  JOB_DELETE: 'JOB_DELETE',
  JOB_ACTIVATE: 'JOB_ACTIVATE',
  JOB_DEACTIVATE: 'JOB_DEACTIVATE',
  ATS_SOURCE_CREATE: 'ATS_SOURCE_CREATE',
  ATS_SOURCE_UPDATE: 'ATS_SOURCE_UPDATE',
  ATS_SOURCE_DELETE: 'ATS_SOURCE_DELETE',
  ATS_SCRAPE_NOW: 'ATS_SCRAPE_NOW',
  ATS_SCRAPE_ALL: 'ATS_SCRAPE_ALL',
} as const;

export type AdminActionName = (typeof AdminAction)[keyof typeof AdminAction];

/** Pulls the safest actor/IP/UA context from an Express request. */
export function contextFromRequest(req: Request): AuditContext {
  const actorUserId = (req.user as { sub?: string } | undefined)?.sub ?? null;
  const ipAddress =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  return { actorUserId, ipAddress, userAgent };
}

/**
 * Writes an AdminAuditLog row. Fire-and-forget: it never throws into the
 * request path (an audit failure should not break the primary operation).
 */
export async function writeAudit(input: {
  context?: AuditContext;
  action: AdminActionName;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: input.context?.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ? (input.meta as object) : undefined,
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });
  } catch (err) {
    console.warn(
      '[audit] failed to write AdminAuditLog:',
      err instanceof Error ? err.message : err,
    );
  }
}

export async function listAudit(input: {
  limit?: number;
  action?: string;
  actorUserId?: string;
  targetType?: string;
}): Promise<
  {
    id: string;
    actorUserId: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    meta: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }[]
> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  return prisma.adminAuditLog.findMany({
    where: {
      action: input.action ? input.action : undefined,
      actorUserId: input.actorUserId ? input.actorUserId : undefined,
      targetType: input.targetType ? input.targetType : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export default { writeAudit, listAudit, contextFromRequest, AdminAction };