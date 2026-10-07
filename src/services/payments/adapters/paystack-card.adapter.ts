import { PrismaClient } from '@prisma/client';
import type { PaymentProviderAdapter, CheckoutResult } from '../payment.provider.js';
import type { PaymentTierId } from '../../../config/featureFlags.js';
import { env } from '../../../config/env.js';

const prisma = new PrismaClient();

interface PaystackInitOpts {
  secretKey: string;
}

export class PaystackCardAdapter implements PaymentProviderAdapter {
  readonly id = 'paystack' as const;
  private secretKey: string;

  constructor(opts: PaystackInitOpts) {
    this.secretKey = opts.secretKey || env.PAYSTACK_SECRET_KEY || '';
  }

  private getPaystackClient() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Paystack = require('paystack');
    return Paystack(this.secretKey);
  }

  async initiateCheckout(
    phone: string,
    amountKES: number,
    tier: PaymentTierId,
    userId: string,
    returnUrl?: string,
  ): Promise<CheckoutResult> {
    const amountLowestUnit = Math.round(amountKES * 100);
    const reference = `medremote-${tier}-${userId}-${Date.now()}`;
    const callback_url = returnUrl || `${env.BACKEND_URL}/api/webhooks/payments/paystack-verify`;

    const client = this.getPaystackClient();
    const response = await client.transaction.initialize({
      amount: amountLowestUnit,
      currency: 'KES',
      reference,
      email: `${userId}@medremote.local`,
      callback_url,
      metadata: {
        userId,
        tier,
        amountKES,
        phone,
        provider: 'paystack',
      },
    });

    const authorization_url: string = response?.data?.authorization_url || '';
    const paystackRef: string = response?.data?.reference || reference;
    const accessCode: string = response?.data?.access_code || '';

    const fakeMerchantId = 'paystack-' + accessCode.slice(0, 16);
    const fakeCheckoutId = paystackRef;

    await prisma.payment.create({
      data: {
        merchantRequestId: fakeMerchantId,
        checkoutRequestId: fakeCheckoutId,
        phoneNumber: phone,
        amount: amountKES,
        amountKES,
        status: 'PENDING',
        userId,
        provider: 'paystack',
        tier,
      },
    }).catch(() => {});

    return {
      checkoutId: fakeCheckoutId,
      providerReference: paystackRef,
      provider: 'paystack',
      checkoutRedirect: authorization_url,
      pollingWaitMs: 5000,
    };
  }

  async queryStatus(checkoutId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'> {
    const payment = await prisma.payment.findUnique({
      where: { checkoutRequestId: checkoutId },
      select: { status: true },
    });
    if (payment?.status === 'SUCCESS') return 'SUCCESS';
    if (payment?.status === 'FAILED') return 'FAILED';

    try {
      const client = this.getPaystackClient();
      const ver = await client.transaction.verify({ reference: checkoutId });
      const paystackStatus = ver?.data?.status;
      if (paystackStatus === 'success') return 'SUCCESS';
      if (paystackStatus === 'failed' || paystackStatus === 'abandoned') return 'FAILED';
    } catch {}
    return 'PENDING';
  }

  async refundPartial(paymentId: string, _reason?: string): Promise<{ refunded: boolean }> {
    const p = await prisma.payment.findUnique({ where: { id: paymentId }, select: { amount: true, checkoutRequestId: true } });
    if (!p) return { refunded: false };
    try {
      const client = this.getPaystackClient();
      await client.refund.create({
        transaction: p.checkoutRequestId,
        amount: Math.round(Number(p.amount || 0) * 100),
      });
      return { refunded: true };
    } catch (e) {
      console.warn('[paystack-card.adapter] refund failed', e instanceof Error ? e.message : e);
      return { refunded: false };
    }
  }
}
