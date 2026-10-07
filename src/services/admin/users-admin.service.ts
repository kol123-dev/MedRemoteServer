import { PrismaClient, Role, PaymentTier } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeAudit, contextFromRequest, AdminAction } from './audit.service.js';
import type { Request } from 'express';
import { PaymentTierId } from '../../config/featureFlags.js';

const prisma = new PrismaClient();

export interface UserSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string;
  role: Role;
  tier: PaymentTier;
  source: string;
  subscriptionEndsAt: Date | null;
  lastLoggedInAt: Date | null;
  isActive: boolean | null;
  atsScore: number | null;
  createdAt: Date;
}

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  role: true,
  tier: true,
  source: true,
  subscriptionEndsAt: true,
  lastLoggedInAt: true,
  isActive: true,
  atsScore: true,
  createdAt: true,
} satisfies Record<string, boolean>;

export async function listUsers(req: Request, input: {
  search?: string;
  role?: Role;
  tier?: PaymentTierId;
  active?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ items: UserSummary[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
  const where = {
    ...(input.search
      ? {
          OR: [
            { email: { contains: input.search, mode: 'insensitive' as const } },
            { phoneNumber: { contains: input.search } },
            { firstName: { contains: input.search, mode: 'insensitive' as const } },
            { lastName: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.tier ? { tier: input.tier as PaymentTier } : {}),
    ...(typeof input.active === 'boolean' ? { isActive: input.active } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  await writeAudit({ context: contextFromRequest(req), action: AdminAction.USER_UPDATE, meta: undefined });

  return { items, total, page, pageSize };
}

export async function getUserDetail(req: Request, id: string): Promise<UserSummary | null> {
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
}

export async function createUser(
  req: Request,
  input: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    role: Role;
  },
): Promise<UserSummary> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: input.phoneNumber,
      email: input.email || null,
      passwordHash,
      role: input.role,
      source: 'MANUAL_UPLOAD',
    },
    select: USER_SELECT,
  });
  await writeAudit({
    context: contextFromRequest(req),
    action: AdminAction.USER_CREATE,
    targetType: 'user',
    targetId: user.id,
    meta: { role: input.role },
  });
  return user;
}

export async function updateUser(
  req: Request,
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    role?: Role;
    tier?: PaymentTier;
    password?: string;
  },
): Promise<UserSummary> {
  const nextPasswordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
      ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
    },
    select: USER_SELECT,
  });
  await writeAudit({
    context: contextFromRequest(req),
    action: input.role ? AdminAction.USER_UPDATE_ROLE : AdminAction.USER_UPDATE,
    targetType: 'user',
    targetId: user.id,
    meta: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.tier ? { tier: input.tier } : {}),
      passwordReset: Boolean(input.password),
    },
  });
  return user;
}

/** Deactivate or re-activate a user account (soft). */
export async function setUserActive(
  req: Request,
  id: string,
  active: boolean,
): Promise<UserSummary> {
  const user = await prisma.user.update({
    where: { id },
    data: { isActive: active },
    select: USER_SELECT,
  });
  await writeAudit({
    context: contextFromRequest(req),
    action: active ? AdminAction.USER_ACTIVATE : AdminAction.USER_DEACTIVATE,
    targetType: 'user',
    targetId: user.id,
  });
  return user;
}

export async function bulkSetActive(
  req: Request,
  ids: string[],
  active: boolean,
): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { isActive: active },
  });
  await writeAudit({
    context: contextFromRequest(req),
    action: active ? AdminAction.USER_ACTIVATE : AdminAction.USER_DEACTIVATE,
    targetType: 'user',
    meta: { count: result.count, ids },
  });
  return result.count;
}

export async function userActivity(req: Request, id: string, limit = 50) {
  const [resumeVersions, matches, applications, auditRows] = await Promise.all([
    prisma.resumeVersion.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.jobMatch.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.application.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.adminAuditLog.findMany({
      where: { actorUserId: id, OR: [{ targetType: 'user' }, { targetType: 'session' }] },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);
  return {
    resumeVersions: resumeVersions.length,
    matches: matches.length,
    applications: applications.length,
    latestAudit: auditRows,
  };
}