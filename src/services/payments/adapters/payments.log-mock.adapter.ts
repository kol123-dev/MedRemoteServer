import { PrismaClient } from '@prisma/client';
import type { PaymentProviderAdapter, CheckoutResult } from '../payment.provider.js';
import type { PaymentTierId } from '../../../config/featureFlags.js';

const prisma = new PrismaClient();

export class LogMockPaymentAdapter implements PaymentProviderAdapter {
  readonly id = 'mock' as const;

  async initiateCheckout(
    phone: string,
    amountKES: number,
    tier: PaymentTierId,
    userId: string,
    _returnUrl?: string,
  ): Promise<CheckoutResult> {
    await new Promise(r => setTimeout(r, 2000));
    const reference = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const checkoutId = `mock-chk-${reference}`;
    const providerRef = `mock-ref-${reference}`;

    console.info('[payments.log-mock.adapter] initiateCheckout success (stub)', {
      phone, amountKES, tier, userId, checkoutId,
    });

    await prisma.payment.create({
      data: {
        merchantRequestId: providerRef,
        checkoutRequestId: checkoutId,
        phoneNumber: phone,
        amount: amountKES,
        amountKES,
        status: 'PENDING',
        userId,
        provider: 'mock',
        tier,
      },
    }).catch(() => {});

    return {
      checkoutId,
      providerReference: providerRef,
      provider: 'mock',
      checkoutRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/success?ref=${reference}`,
      pollingWaitMs: 2000,
    };
  }

  async queryStatus(_checkoutId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'> {
    return 'SUCCESS';
  }

  async refundPartial(_paymentId: string, _reason?: string): Promise<{ refunded: boolean }> {
    console.info('[payments.log-mock.adapter] refundPartial (stub ok)', { _paymentId });
    return { refunded: true };
  }
}
