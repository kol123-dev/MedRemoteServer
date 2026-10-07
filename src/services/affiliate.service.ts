import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { REFERRAL_CODE_LENGTH } from '../config/featureFlags.js';
import { env } from '../config/env.js';
import {
  requestPayout as payoutServiceRequestPayout,
  dashboardStats as payoutDashboardStats,
} from './affiliate-payout.service.js';

const prisma = new PrismaClient();

const REFERRAL_KIND_CLICK = 'CLICK' as const;
const REFERRAL_KIND_SIGNUP = 'SIGNUP' as const;
const REFERRAL_KIND_PAYMENT = 'PAYMENT' as const;

type ReferralKind = typeof REFERRAL_KIND_CLICK | typeof REFERRAL_KIND_SIGNUP | typeof REFERRAL_KIND_PAYMENT;

export function generateReferralCode(): string {
  const length = REFERRAL_CODE_LENGTH;
  let code = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    code += chars[byte % chars.length];
  }
  return code;
}

function isValidCustomCode(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code);
}

interface EnsureAffiliateOptions {
  customCode?: string;
}

export async function ensureAffiliateForUser(
  userId: string,
  options: EnsureAffiliateOptions = {},
): Promise<{ affiliate: { id: string; userId: string; referralCode: string; referralLink: string } }> {
  const existing = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, userId: true, referralCode: true },
  });

  if (existing) {
    return {
      affiliate: {
        ...existing,
        referralLink: `${env.FRONTEND_URL}/signup?ref=${existing.referralCode}`,
      },
    };
  }

  let referralCode: string;

  if (options.customCode !== undefined) {
    const trimmed = options.customCode.trim().toUpperCase();
    if (!isValidCustomCode(trimmed)) {
      throw new Error('Custom referral code must be 6-12 uppercase alphanumeric characters');
    }
    const taken = await prisma.affiliate.findUnique({ where: { referralCode: trimmed } });
    if (taken) {
      throw new Error('Custom referral code is already taken');
    }
    referralCode = trimmed;
  } else {
    let attempts = 0;
    while (true) {
      referralCode = generateReferralCode();
      const taken = await prisma.affiliate.findUnique({ where: { referralCode } });
      if (!taken) break;
      attempts++;
      if (attempts > 10) {
        throw new Error('Failed to generate unique referral code');
      }
    }
  }

  const created = await prisma.affiliate.create({
    data: {
      userId,
      referralCode,
    },
    select: { id: true, userId: true, referralCode: true },
  });

  return {
    affiliate: {
      ...created,
      referralLink: `${env.FRONTEND_URL}/signup?ref=${created.referralCode}`,
    },
  };
}

interface TrackClickOptions {
  ip?: string;
  userAgent?: string;
}

export async function trackClick(
  code: string,
  options: TrackClickOptions = {},
): Promise<{ referralLink: string; clicked: true }> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { referralCode: code },
    select: { id: true, referralCode: true },
  });

  if (!affiliate) {
    const error: Error & { statusCode?: number } = new Error('Affiliate code not found');
    error.statusCode = 404;
    throw error;
  }

  await prisma.$transaction([
    prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { clicks: { increment: 1 } },
    }),
    prisma.referralEvent.create({
      data: {
        affiliateId: affiliate.id,
        kind: REFERRAL_KIND_CLICK,
        ip: options.ip ?? null,
        ua: options.userAgent ?? null,
      },
    }),
  ]);

  return {
    referralLink: `${env.FRONTEND_URL}/signup?ref=${affiliate.referralCode}`,
    clicked: true,
  };
}

interface PerEventBreakdown {
  CLICK: number;
  SIGNUP: number;
  PAYMENT: number;
}

interface DashboardStatsResult {
  code: string;
  referralLink: string;
  clicks: number;
  signups: number;
  totalConversions: number;
  pendingPayoutKES: number;
  paidTotalKES: number;
  perEventBreakdown: PerEventBreakdown;
  recentReferrals: Array<{
    id: string;
    kind: string;
    createdAt: Date;
    commissionAmountDecimal: number | null;
  }>;
}

export async function getDashboardStats(userId: string): Promise<DashboardStatsResult> {
  const { affiliate } = await ensureAffiliateForUser(userId);

  const [affiliateRow, clickAgg, signupAgg, paymentAgg, paidAgg, recentEvents] = await Promise.all([
    prisma.affiliate.findUnique({
      where: { id: affiliate.id },
      select: {
        clicks: true,
        conversions: true,
        pendingPayoutDecimal: true,
        totalEarnedDecimal: true,
        referralCode: true,
      },
    }),
    prisma.referralEvent.aggregate({
      where: { affiliateId: affiliate.id, kind: REFERRAL_KIND_CLICK },
      _count: { _all: true },
    }),
    prisma.referralEvent.aggregate({
      where: { affiliateId: affiliate.id, kind: REFERRAL_KIND_SIGNUP },
      _count: { _all: true },
    }),
    prisma.referralEvent.aggregate({
      where: { affiliateId: affiliate.id, kind: REFERRAL_KIND_PAYMENT },
      _count: { _all: true },
    }),
    prisma.payout.aggregate({
      where: { affiliateId: affiliate.id, status: { in: ['PAID', 'SENT_MPESA'] } },
      _sum: { amountDecimal: true },
    }),
    prisma.referralEvent.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        kind: true,
        createdAt: true,
        commissionAmountDecimal: true,
      },
    }),
  ]);

  void payoutDashboardStats;

  const clicks = clickAgg._count._all || affiliateRow?.clicks || 0;
  const signups = signupAgg._count._all || 0;
  const paymentCount = paymentAgg._count._all || 0;
  const totalConversions = affiliateRow?.conversions || signups + paymentCount;
  const pendingPayoutKES = Number(affiliateRow?.pendingPayoutDecimal ?? 0);
  const paidTotalKES = Number(paidAgg._sum.amountDecimal ?? affiliateRow?.totalEarnedDecimal ?? 0);

  return {
    code: affiliateRow?.referralCode || affiliate.referralCode,
    referralLink: `${env.FRONTEND_URL}/signup?ref=${affiliateRow?.referralCode || affiliate.referralCode}`,
    clicks,
    signups,
    totalConversions,
    pendingPayoutKES,
    paidTotalKES,
    perEventBreakdown: {
      CLICK: clicks,
      SIGNUP: signups,
      PAYMENT: paymentCount,
    },
    recentReferrals: recentEvents,
  };
}

interface RequestPayoutOptions {
  method?: 'M-Pesa';
}

export async function requestPayout(
  userId: string,
  options: RequestPayoutOptions = {},
): Promise<{
  payoutId: string;
  amountKES: number;
  status: 'REQUESTED';
  method: 'M-Pesa';
  requestedAt: Date;
  thresholdMet: boolean;
  newPendingBalanceKES: number;
}> {
  const { affiliate } = await ensureAffiliateForUser(userId);
  const method: 'M-Pesa' = options.method ?? 'M-Pesa';
  return payoutServiceRequestPayout(affiliate.id, method);
}

export type { ReferralKind };
