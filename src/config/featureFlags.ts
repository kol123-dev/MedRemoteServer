import type { User } from '@prisma/client';
import { z } from 'zod';

export const PaymentTierId = z.enum(['FREE', 'BASIC', 'PREMIUM', 'LIFETIME']);
export type PaymentTierId = z.infer<typeof PaymentTierId>;

export interface TierFeatureCaps {
  maxResumeRewritesPerMonth: number;
  maxResumeAnalyzesPerDay: number;
  maxMatchesPerQuery: number;
  maxMatchRecalcPerMonth: number;
  maxAppliesPerMonth: number;
  allowMatchRecalcAsync: boolean;
  allowResumeDownload: boolean;
  priceKES: number;
  priceUSD: number;
  displayName: string;
  features: string[];
}

export const TIER_CAPS: Record<PaymentTierId, TierFeatureCaps> = {
  FREE: {
    maxResumeRewritesPerMonth: 0,
    maxResumeAnalyzesPerDay: 5,
    maxMatchesPerQuery: 10,
    maxMatchRecalcPerMonth: 0,
    maxAppliesPerMonth: 0,
    allowMatchRecalcAsync: false,
    allowResumeDownload: false,
    priceKES: 0,
    priceUSD: 0,
    displayName: 'Free Trial',
    features: [
      'Browse 3,000+ Kenya-to-Global jobs',
      'Resume ATS Analyze × 5/day',
      'Top 10 Match engine results/day',
      'No AI rewrites, no 1-Click Apply',
    ],
  },
  BASIC: {
    maxResumeRewritesPerMonth: 10,
    maxResumeAnalyzesPerDay: 50,
    maxMatchesPerQuery: 100,
    maxMatchRecalcPerMonth: 100,
    maxAppliesPerMonth: 30,
    allowMatchRecalcAsync: true,
    allowResumeDownload: true,
    priceKES: 500,
    priceUSD: 5,
    displayName: 'Basic — M-Pesa KES 500/mo',
    features: [
      '10× AI resume rewrites (KNCK → US ATS standard)',
      'Unlimited ATS analyzer',
      'Top 100 94% matches with missing skills breakdown',
      '30× 1-Click Apply pre-filled packages',
      'Kenya M-Pesa STK Push or card',
    ],
  },
  PREMIUM: {
    maxResumeRewritesPerMonth: Number.POSITIVE_INFINITY,
    maxResumeAnalyzesPerDay: Number.POSITIVE_INFINITY,
    maxMatchesPerQuery: 500,
    maxMatchRecalcPerMonth: Number.POSITIVE_INFINITY,
    maxAppliesPerMonth: 200,
    allowMatchRecalcAsync: true,
    allowResumeDownload: true,
    priceKES: 1500,
    priceUSD: 15,
    displayName: 'Premium — KES 1,500/mo',
    features: [
      'Unlimited AI rewrites, bulk export PDF + Word',
      'Unlimited match recalculation after every scrape',
      '200× 1-Click Apply packages/month',
      'Priority support Kenya + US employers',
    ],
  },
  LIFETIME: {
    maxResumeRewritesPerMonth: Number.POSITIVE_INFINITY,
    maxResumeAnalyzesPerDay: Number.POSITIVE_INFINITY,
    maxMatchesPerQuery: Number.POSITIVE_INFINITY,
    maxMatchRecalcPerMonth: Number.POSITIVE_INFINITY,
    maxAppliesPerMonth: Number.POSITIVE_INFINITY,
    allowMatchRecalcAsync: true,
    allowResumeDownload: true,
    priceKES: 19900,
    priceUSD: 199,
    displayName: 'Lifetime — One-time KES 19,900',
    features: [
      'Everything in Premium, forever',
      'Lifetime 94% match access',
      'All future AI features free',
      'VIP affiliate tier for referrals',
    ],
  },
};

export const DEFAULT_LLM_PROVIDER = 'openai' as const;
export const DEFAULT_LLM_MODEL_FREE = 'gpt-4o-mini';
export const DEFAULT_LLM_MODEL_PAID = 'gpt-4o-mini';
export const LLM_TEMPERATURE_RESUME = 0.3;
export const LLM_TEMPERATURE_COVERLETTER = 0.5;
export const LLM_TEMPERATURE_MATCHING = 0.1;

export const IDEMPOTENCY_CACHE_TTL_SECONDS = 60 * 60;
export const SUBSCRIPTION_GRACE_PERIOD_HOURS = 72;
export const SUBSCRIPTION_DURATION_DAYS_DEFAULT = 30;
export const AFFILIATE_COMMISSION_PCT = 0.2;
export const REFERRAL_CODE_LENGTH = 6;

export function tierOf(user: Pick<User, 'tier'> | null): PaymentTierId {
  if (!user) return 'FREE';
  const t = user.tier as unknown as string;
  return PaymentTierId.safeParse(t).success ? (t as PaymentTierId) : 'FREE';
}

export function caps(user: Pick<User, 'tier'> | null): TierFeatureCaps {
  return TIER_CAPS[tierOf(user)];
}

export function hasSufficientTier(
  user: Pick<User, 'tier'> | null,
  required: PaymentTierId,
): boolean {
  const order: PaymentTierId[] = ['FREE', 'BASIC', 'PREMIUM', 'LIFETIME'];
  return order.indexOf(tierOf(user)) >= order.indexOf(required);
}

export function tierLimitExhaustedError(
  feature: string,
  tier: PaymentTierId,
): { error: string; code: 402 } {
  return {
    error: `Tier limit exceeded for "${feature}" on ${tier} tier. Upgrade via M-Pesa (KES ${TIER_CAPS.BASIC.priceKES}/mo, KES ${TIER_CAPS.PREMIUM.priceKES}/mo) or card.`,
    code: 402,
  };
}
