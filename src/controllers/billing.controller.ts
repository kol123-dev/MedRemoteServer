import { Request, Response } from 'express';
import { PrismaClient, PaymentStatus } from '@prisma/client';
import {
  listPlansForPricingApi,
  generateMpesaStkPushForCheckout,
  isCurrentlySubscribed,
  cancelAtPeriodEnd,
} from '../services/subscription.service.js';
import { initiateCheckoutMpesaFirst, queryPaymentStatusWrapper } from '../services/payments/payment.provider.js';
import { PaymentTierId } from '../config/featureFlags.js';
import { ProviderId } from '../services/payments/payment.provider.js';

const prisma = new PrismaClient();

export const listPlansHandler = (_req: Request, res: Response): void => {
  try {
    const plans = listPlansForPricingApi();
    res.status(200).json({ success: true, data: plans });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const initiateMpesaCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { phone, tier, referralCode } = req.body;

    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ success: false, error: 'Valid Kenyan phone number required' });
      return;
    }
    if (!tier || !['BASIC', 'PREMIUM', 'LIFETIME'].includes(tier)) {
      res.status(400).json({ success: false, error: 'Valid tier required: BASIC | PREMIUM | LIFETIME' });
      return;
    }

    const result = await generateMpesaStkPushForCheckout(
      userId,
      phone,
      tier as PaymentTierId,
      referralCode as string | undefined,
      'mpesa',
    );

    res.status(200).json({
      success: true,
      message: result.provider === 'mpesa'
        ? 'Check your phone for the M-Pesa PIN prompt.'
        : `M-Pesa STK unavailable; redirected via ${result.provider.toUpperCase()} fallback link.`,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const initiateCardCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { phone, tier, returnUrl } = req.body;
    if (!tier || !['BASIC', 'PREMIUM', 'LIFETIME'].includes(tier)) {
      res.status(400).json({ success: false, error: 'Valid tier required: BASIC | PREMIUM | LIFETIME' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } });
    const effectivePhone = (phone ?? user?.phoneNumber) as string;
    if (!effectivePhone) {
      res.status(400).json({ success: false, error: 'Phone number required for Paystack' });
      return;
    }

    const { TIER_CAPS } = await import('../config/featureFlags.js');
    const caps = TIER_CAPS[tier as PaymentTierId];
    const amountKES = caps.priceKES;

    const result = await initiateCheckoutMpesaFirst(
      effectivePhone,
      amountKES,
      tier as PaymentTierId,
      userId,
      'paystack' as ProviderId,
      returnUrl,
    );

    res.status(200).json({
      success: true,
      message: result.checkoutRedirect
        ? 'Open the checkoutRedirect URL in your browser to complete card payment.'
        : 'Checkout initiated — poll via /api/billing/history for status.',
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listPaymentHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const [payments, subscribed] = await Promise.all([
      prisma.payment.findMany({
        where: { userId },
        select: {
          id: true,
          checkoutRequestId: true,
          merchantRequestId: true,
          mpesaReceiptNo: true,
          amount: true,
          amountKES: true,
          status: true,
          provider: true,
          tier: true,
          receiptUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      isCurrentlySubscribed(userId),
    ]);

    res.status(200).json({
      success: true,
      data: {
        payments,
        subscribed,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const result = await cancelAtPeriodEnd(userId);
    res.status(200).json({
      success: true,
      message: 'Auto-renew cancelled. Access remains active until the paid period end date.',
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
