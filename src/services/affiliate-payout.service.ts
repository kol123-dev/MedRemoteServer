import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAYOUT_THRESHOLD_KES = 5000;

export interface PayoutDueResult {
  pendingKES: number;
  payableThresholdPassed: boolean;
}

export async function calculatePayoutDue(affiliateId: string): Promise<PayoutDueResult> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { pendingPayoutDecimal: true },
  });
  const pendingKES = Number(affiliate?.pendingPayoutDecimal ?? 0);
  return {
    pendingKES,
    payableThresholdPassed: pendingKES >= PAYOUT_THRESHOLD_KES,
  };
}

export interface RequestPayoutResult {
  payoutId: string;
  amountKES: number;
  status: 'REQUESTED';
  method: 'M-Pesa';
  requestedAt: Date;
  thresholdMet: boolean;
  newPendingBalanceKES: number;
}

export async function requestPayout(
  affiliateId: string,
  method: 'M-Pesa' = 'M-Pesa',
): Promise<RequestPayoutResult> {
  const { pendingKES, payableThresholdPassed } = await calculatePayoutDue(affiliateId);
  if (!payableThresholdPassed) {
    throw new Error(
      `Payout threshold KES ${PAYOUT_THRESHOLD_KES} not yet met. Current pending: KES ${pendingKES.toFixed(2)}.`
    );
  }

  const requestedAt = new Date();
  const payout = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({
      data: {
        affiliateId,
        amountDecimal: pendingKES,
        status: 'REQUESTED',
        requestedAt,
      },
    });

    await tx.affiliate.update({
      where: { id: affiliateId },
      data: { pendingPayoutDecimal: 0 },
    });

    return p;
  });

  return {
    payoutId: payout.id,
    amountKES: pendingKES,
    status: 'REQUESTED',
    method,
    requestedAt,
    thresholdMet: true,
    newPendingBalanceKES: 0,
  };
}

export interface AffiliateDashboardStats {
  totalClicks: number;
  totalSignups: number;
  paidPayoutsKES: number;
  pendingBalanceKES: number;
}

export async function dashboardStats(affiliateId: string): Promise<AffiliateDashboardStats> {
  const [affiliate, clicksAgg, signupsAgg, paidAgg] = await Promise.all([
    prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        pendingPayoutDecimal: true,
        clicks: true,
        conversions: true,
        totalEarnedDecimal: true,
      },
    }),
    prisma.referralEvent.aggregate({
      where: { affiliateId, kind: 'CLICK' },
      _count: { _all: true },
    }),
    prisma.referralEvent.aggregate({
      where: { affiliateId, kind: 'SIGNUP' },
      _count: { _all: true },
    }),
    prisma.payout.aggregate({
      where: { affiliateId, status: { in: ['PAID', 'SENT_MPESA'] } },
      _sum: { amountDecimal: true },
    }),
  ]);

  const totalClicks = clicksAgg._count._all || affiliate?.clicks || 0;
  const totalSignups = signupsAgg._count._all || affiliate?.conversions || 0;
  const paidPayoutsKES = Number(paidAgg._sum.amountDecimal ?? 0);
  const pendingBalanceKES = Number(affiliate?.pendingPayoutDecimal ?? 0);

  return {
    totalClicks,
    totalSignups,
    paidPayoutsKES,
    pendingBalanceKES,
  };
}
