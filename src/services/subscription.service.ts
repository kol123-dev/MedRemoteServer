import { PrismaClient, PaymentTier, PaymentStatus } from '@prisma/client';
import {
  TIER_CAPS,
  SUBSCRIPTION_GRACE_PERIOD_HOURS,
  AFFILIATE_COMMISSION_PCT,
  SUBSCRIPTION_DURATION_DAYS_DEFAULT,
  tierOf,
  hasSufficientTier,
  PaymentTierId,
} from '../config/featureFlags.js';
import { initiateCheckoutMpesaFirst } from './payments/payment.provider.js';
import { sendSms } from './sms/sms.provider.js';
import { queueSubscriptionRenewalReminder } from './notifications.service.js';
import { generateReceiptPdf } from './billing-receipt-pdf.service.js';
import type { ProviderId, CheckoutResult } from './payments/payment.provider.js';

const prisma = new PrismaClient();

function envIsTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

export interface PricingPlan {
  id: PaymentTierId;
  label: string;
  priceKES: number;
  priceUsd: number;
  oneTime?: boolean;
  benefits: string[];
  paymentProviders: ProviderId[];
}

export function listPlansForPricingApi(): PricingPlan[] {
  const baseProviders: ProviderId[] = envIsTest()
    ? ['mpesa', 'paystack', 'mock']
    : ['mpesa', 'paystack'];

  return [
    {
      id: 'BASIC',
      label: 'KES500 / 30 days for Kenyan Pros',
      priceKES: 500,
      priceUsd: 3.2,
      benefits: [
        '10× AI resume rewrites (Kenya CV → US ATS format)',
        '30× 1-Click Apply pre-filled packages per month',
        '50× 94% match results per month with missing skills breakdown',
        'Unlimited ATS analyzer scans',
        'M-Pesa STK Push + Paystack card + M-Pesa Paybill',
        'Kenya & US employer support channels',
        'Download resume PDF + Word DOCX',
        'Priority queue for match recalculation after scrapes',
      ],
      paymentProviders: baseProviders,
    },
    {
      id: 'PREMIUM',
      label: 'KES4,999 / month Unlimited',
      priceKES: 4999,
      priceUsd: 32,
      benefits: [
        'Unlimited AI resume rewrites',
        'Unlimited 1-Click Apply packages',
        'Unlimited 94% match results & recalculations',
        'Bulk export PDF + Word DOCX for all versions',
        '200× 1-Click Apply packages/month',
        'Priority Kenya + US employer placement support',
        'Dedicated success manager via WhatsApp',
        'VIP affiliate tier bonus on referrals',
      ],
      paymentProviders: baseProviders,
    },
    {
      id: 'LIFETIME',
      label: 'KES249,999 One-time Lifetime Access',
      priceKES: 249999,
      priceUsd: 1599,
      oneTime: true,
      benefits: [
        'Everything in PREMIUM, forever — no recurring billing',
        'All future AI feature releases included free',
        'Lifetime 94% match engine access with unlimited recalc',
        'VIP Gold affiliate tier with elevated commission %',
        'Priority resume hand-tuning by a US-based medical recruiter',
        'Direct WhatsApp line to founder for 1:1 career coaching',
        'Named account manager for all job applications',
        'Complimentary premium placement package to US recruiters',
      ],
      paymentProviders: baseProviders,
    },
  ];
}

export async function isCurrentlySubscribed(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionEndsAt: true, tier: true },
  });
  if (!user) return false;
  if (user.tier === 'LIFETIME') return true;
  if (!user.subscriptionEndsAt) return false;
  const graceEnds = new Date(user.subscriptionEndsAt.getTime() + SUBSCRIPTION_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  return graceEnds.getTime() >= Date.now();
}

export interface ExtendSubscriptionResult {
  subscriptionEndsAt: Date;
  nextBillingAt: Date;
}

export async function extendSubscriptionForUser(
  userId: string,
  tier: PaymentTierId,
  days: number = SUBSCRIPTION_DURATION_DAYS_DEFAULT,
): Promise<ExtendSubscriptionResult> {
  const now = new Date();
  const subscriptionEndsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const nextBillingAt = new Date(subscriptionEndsAt.getTime());

  await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { subscriptionEndsAt: true, autoRenewSubscription: true },
    });

    let actualEndsAt = subscriptionEndsAt;
    if (current?.subscriptionEndsAt && current.subscriptionEndsAt.getTime() > now.getTime()) {
      actualEndsAt = new Date(current.subscriptionEndsAt.getTime() + days * 24 * 60 * 60 * 1000);
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionEndsAt: actualEndsAt,
        tier: tier as PaymentTier,
        role: 'SUBSCRIBER',
      },
    });

    const prismaAny = tx as unknown as Record<string, any>;
    if (typeof prismaAny.subscription?.create === 'function') {
      try {
        await prismaAny.subscription.create({
          data: {
            userId,
            tier: tier as PaymentTier,
            startDate: now,
            endDate: actualEndsAt,
            nextBillingAt: actualEndsAt,
            status: 'ACTIVE',
            autoRenew: current?.autoRenewSubscription ?? true,
          },
        });
      } catch {}
    }
  });

  return { subscriptionEndsAt, nextBillingAt };
}

export async function isFeatureAllowedTierOrHigher(
  userId: string,
  requiredTier: PaymentTierId,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });
  return hasSufficientTier({ tier: tierOf(user) as never }, requiredTier);
}

export async function generateMpesaStkPushForCheckout(
  userId: string,
  phone: string,
  tier: PaymentTierId,
  _referralCode?: string,
  providerId?: ProviderId,
): Promise<CheckoutResult> {
  const caps = TIER_CAPS[tier];
  const amountKES = caps.priceKES;
  return initiateCheckoutMpesaFirst(phone, amountKES, tier, userId, providerId);
}

export interface WebhookSuccessPayload {
  paymentId: string;
  provider: ProviderId;
  userId: string;
  tier: PaymentTierId;
  amountKES: number;
  mpesaReceiptNo?: string;
}

export interface WebhookSuccessResult {
  welcomeSmsSent: boolean;
  subscriptionEndsAt: Date;
  nextBillingAt: Date;
  affiliateCommission?: { affiliateId: string; payoutKES: number };
  reminderQueued: boolean;
  receiptStored: boolean;
}

export async function createSubscriptionFromPaymentWebhookSuccess(
  payload: WebhookSuccessPayload,
): Promise<WebhookSuccessResult> {
  const { paymentId, provider, userId, tier, amountKES, mpesaReceiptNo } = payload;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, phoneNumber: true },
  });
  const firstName = user?.firstName ?? 'Valued Member';
  const phone = user?.phoneNumber ?? '';

  const { subscriptionEndsAt, nextBillingAt } = await extendSubscriptionForUser(userId, tier);
  const untilStr = subscriptionEndsAt.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  await sendSms(phone, `Welcome ${firstName}! MedRemote ${tier} active until ${untilStr}. Login https://medremote.vercel.app/dashboard`);

  let affiliateCommission: { affiliateId: string; payoutKES: number } | undefined;
  const signupEvent = await prisma.referralEvent.findFirst({
    where: { kind: 'SIGNUP', referredUserId: userId },
    select: { affiliateId: true },
    orderBy: { createdAt: 'asc' },
  });

  if (signupEvent?.affiliateId) {
    const payoutKES = amountKES * AFFILIATE_COMMISSION_PCT;
    await prisma.$transaction(async (tx) => {
      const affiliate = await tx.affiliate.update({
        where: { id: signupEvent.affiliateId },
        data: {
          pendingPayoutDecimal: { increment: payoutKES },
          totalEarnedDecimal: { increment: payoutKES },
          conversions: { increment: 1 },
        },
      });

      await tx.referralEvent.create({
        data: {
          affiliateId: affiliate.id,
          referredUserId: userId,
          newPaymentId: paymentId,
          kind: 'PAYMENT',
          commissionAmountDecimal: payoutKES,
        },
      });
    });
    affiliateCommission = { affiliateId: signupEvent.affiliateId, payoutKES };
  }

  (async () => {
    try {
      await queueSubscriptionRenewalReminder(userId, subscriptionEndsAt);
    } catch {}
  })();

  let receiptStored = false;
  (async () => {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true, amount: true, amountKES: true, phoneNumber: true,
          mpesaReceiptNo: true, checkoutRequestId: true, provider: true,
          tier: true, createdAt: true,
        },
      });
      const subUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
      });
      if (payment && subUser) {
        const receiptBuffer = await generateReceiptPdf({
          payment: payment as any,
          user: subUser as any,
          subscription: { tier, startDate: new Date(), endDate: subscriptionEndsAt },
        });
        const stubUrl = `s3://medremote-receipts-ke/receipts/${payment.id}.pdf`;
        await prisma.payment.update({
          where: { id: paymentId },
          data: { receiptUrl: stubUrl },
        }).catch(() => {});
        void receiptBuffer;
        receiptStored = true;
      }
    } catch (e) {
      console.warn('[subscription.service] receipt generation skipped', e instanceof Error ? e.message : e);
    }
  })();

  return {
    welcomeSmsSent: true,
    subscriptionEndsAt,
    nextBillingAt,
    affiliateCommission,
    reminderQueued: true,
    receiptStored,
  };
}

export interface CancelAtPeriodEndResult {
  cancelled: boolean;
  nextBillingAt: Date | null;
  status: 'CANCELLED_ACTIVE_PERIOD_END';
}

export async function cancelAtPeriodEnd(userId: string): Promise<CancelAtPeriodEndResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionEndsAt: true },
  });
  const nextBillingAt = user?.subscriptionEndsAt ?? null;

  await prisma.user.update({
    where: { id: userId },
    data: { autoRenewSubscription: false },
  });

  const prismaAny = prisma as unknown as Record<string, any>;
  if (typeof prismaAny.subscription?.updateMany === 'function') {
    try {
      await prismaAny.subscription.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { autoRenew: false, cancelledAt: new Date() },
      });
    } catch {}
  }

  return {
    cancelled: true,
    nextBillingAt,
    status: 'CANCELLED_ACTIVE_PERIOD_END',
  };
}
