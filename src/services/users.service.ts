import { PrismaClient, Role } from '@prisma/client';
import { UserMeShape as UserMeShapeZod } from '../types/user.types.js';
import type { UserMeShape as UserMeShapeType } from '../types/user.types.js';
import { caps, tierOf, tierLimitExhaustedError, TIER_CAPS, SUBSCRIPTION_GRACE_PERIOD_HOURS, PaymentTierId, TierFeatureCaps } from '../config/featureFlags.js';

const prisma = new PrismaClient();

type TierFeature = 'AI_RESUME_REWRITE' | 'AI_AUTO_APPLY' | 'MATCH_RECALC';

interface TierStatusResult {
  tier: PaymentTierId;
  caps: TierFeatureCaps;
  daysRemaining: number;
  isCurrentlySubscribed: boolean;
  gracePeriodActive: boolean;
}

interface IncrementUsageResult {
  allowed: boolean;
  limitExceeded: boolean;
  remainingThisMonth: number;
  error?: ReturnType<typeof tierLimitExhaustedError>;
}

function jsonToStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function formatDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function getMe(userId: string): Promise<UserMeShapeType> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const tierId = tierOf({ tier: user.tier as never });
  const skillsArr = jsonToStringArray(user.skills);
  const preferredCountriesArr = jsonToStringArray(user.preferredCountries);
  const preferredShiftsArr = jsonToStringArray(user.preferredShifts);

  const raw = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    tier: tierId,
    atsScore: user.atsScore,
    skills: skillsArr,
    subscriptionEndsAt: formatDateTime(user.subscriptionEndsAt),
    profileHeadline: user.profileHeadline,
    phoneNumber: user.phoneNumber,
    email: user.email,
    role: (user.role ?? Role.USER) as Role,
    preferredCountries: preferredCountriesArr,
    preferredShifts: preferredShiftsArr,
    minMonthlyCompensation: user.minMonthlyCompensation,
  };

  return UserMeShapeZod.parse(raw);
}

interface PatchMeInput {
  firstName?: string;
  lastName?: string;
  profileHeadline?: string;
  minMonthlyCompensation?: number;
  preferredShifts?: string[];
  preferredCountries?: string[];
  skills?: string[];
  phoneNumber?: string;
}

function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/\s/g, '').replace(/-/g, '');
  if (cleaned.startsWith('+254')) {
    cleaned = '254' + cleaned.slice(4);
  } else if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  }
  return cleaned;
}

export async function patchMe(userId: string, input: PatchMeInput): Promise<UserMeShapeType> {
  const data: Record<string, unknown> = {};

  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.profileHeadline !== undefined) data.profileHeadline = input.profileHeadline;
  if (input.minMonthlyCompensation !== undefined) data.minMonthlyCompensation = input.minMonthlyCompensation;
  if (input.preferredShifts !== undefined) data.preferredShifts = input.preferredShifts;
  if (input.preferredCountries !== undefined) data.preferredCountries = input.preferredCountries;
  if (input.skills !== undefined) data.skills = input.skills;

  if (input.phoneNumber !== undefined) {
    const normalized = normalizePhone(input.phoneNumber);
    const existing = await prisma.user.findUnique({ where: { phoneNumber: normalized } });
    if (existing && existing.id !== userId) {
      throw new Error('Phone number already in use');
    }
    data.phoneNumber = normalized;
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  });

  return getMe(userId);
}

export function getCurrentTierStatus(userId: string): Promise<TierStatusResult> | TierStatusResult {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, subscriptionEndsAt: true },
  }).then((user) => {
    if (!user) {
      return {
        tier: 'FREE',
        caps: TIER_CAPS.FREE,
        daysRemaining: 0,
        isCurrentlySubscribed: false,
        gracePeriodActive: false,
      };
    }

    const tier = tierOf({ tier: user.tier as never });
    const tierCaps = caps({ tier: user.tier as never });
    const now = new Date();

    let daysRemaining = 0;
    let isCurrentlySubscribed = false;
    let gracePeriodActive = false;

    if (tier !== 'FREE' && user.subscriptionEndsAt) {
      const subsEnds = new Date(user.subscriptionEndsAt);
      const graceEnds = new Date(subsEnds.getTime() + SUBSCRIPTION_GRACE_PERIOD_HOURS * 60 * 60 * 1000);

      if (now <= subsEnds) {
        isCurrentlySubscribed = true;
        const msLeft = subsEnds.getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
      } else if (now <= graceEnds) {
        gracePeriodActive = true;
        isCurrentlySubscribed = true;
        daysRemaining = 0;
      }
    }

    return {
      tier,
      caps: tierCaps,
      daysRemaining,
      isCurrentlySubscribed,
      gracePeriodActive,
    };
  });
}

function mapFeatureToAuditKey(feature: TierFeature): string {
  switch (feature) {
    case 'AI_RESUME_REWRITE':
      return 'A_RESUME_REWRITE';
    case 'AI_AUTO_APPLY':
      return 'C_COVER_LETTER_GEN';
    case 'MATCH_RECALC':
      return 'B_MATCHING_RECALC';
  }
}

function mapFeatureToCapKey(feature: TierFeature): keyof TierFeatureCaps {
  switch (feature) {
    case 'AI_RESUME_REWRITE':
      return 'maxResumeRewritesPerMonth';
    case 'AI_AUTO_APPLY':
      return 'maxAppliesPerMonth';
    case 'MATCH_RECALC':
      return 'maxMatchRecalcPerMonth';
  }
}

export async function incrementUsage(
  userId: string,
  feature: TierFeature,
): Promise<IncrementUsageResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });

  if (!user) {
    return {
      allowed: false,
      limitExceeded: true,
      remainingThisMonth: 0,
      error: tierLimitExhaustedError(feature, 'FREE'),
    };
  }

  const tier = tierOf({ tier: user.tier as never });
  const tierCaps = caps({ tier: user.tier as never });
  const capKey = mapFeatureToCapKey(feature);
  const rawCap = tierCaps[capKey];
  const monthlyCap: number = typeof rawCap === 'number' ? rawCap : 0;

  if (monthlyCap === Number.POSITIVE_INFINITY) {
    return {
      allowed: true,
      limitExceeded: false,
      remainingThisMonth: Number.POSITIVE_INFINITY,
    };
  }

  if (!Number.isFinite(monthlyCap) || monthlyCap <= 0) {
    return {
      allowed: false,
      limitExceeded: true,
      remainingThisMonth: 0,
      error: tierLimitExhaustedError(feature, tier),
    };
  }

  const auditFeatureKey = mapFeatureToAuditKey(feature);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usageCount = await prisma.llmCallAudit.count({
    where: {
      userId,
      feature: auditFeatureKey,
      createdAt: { gte: startOfMonth },
      success: true,
    },
  });

  const remaining = Math.max(0, monthlyCap - usageCount);
  const limitExceeded = remaining <= 0;

  if (limitExceeded) {
    return {
      allowed: false,
      limitExceeded: true,
      remainingThisMonth: 0,
      error: tierLimitExhaustedError(feature, tier),
    };
  }

  return {
    allowed: true,
    limitExceeded: false,
    remainingThisMonth: remaining - 1,
  };
}
