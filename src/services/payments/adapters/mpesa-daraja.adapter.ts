import { PrismaClient } from '@prisma/client';
import { initiateStkPush, queryPaymentStatus } from '../../mpesa.service.js';
import type { PaymentProviderAdapter, CheckoutResult } from '../payment.provider.js';
import type { PaymentTierId } from '../../../config/featureFlags.js';

const prisma = new PrismaClient();

export class MpesaDarajaAdapter implements PaymentProviderAdapter {
  readonly id = 'mpesa' as const;

  async initiateCheckout(
    phone: string,
    amountKES: number,
    tier: PaymentTierId,
    userId: string,
    _returnUrl?: string,
  ): Promise<CheckoutResult> {
    const result = await initiateStkPush(phone, amountKES, userId);

    const CheckoutRequestID = result.CheckoutRequestID;
    const MerchantRequestID = result.MerchantRequestID;

    if (CheckoutRequestID) {
      await prisma.payment.update({
        where: { checkoutRequestId: CheckoutRequestID },
        data: {
          amountKES,
          provider: 'mpesa',
          tier,
        },
      }).catch(() => {});
    }

    return {
      checkoutId: CheckoutRequestID,
      providerReference: MerchantRequestID,
      provider: 'mpesa',
      pollingWaitMs: 8000,
    };
  }

  async queryStatus(checkoutId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'> {
    return queryPaymentStatus(checkoutId);
  }

  async refundPartial(paymentId: string, _reason?: string): Promise<{ refunded: boolean }> {
    console.warn('[mpesa-daraja.adapter] refundPartial not wired for M-Pesa yet; stubbed false', { paymentId });
    return { refunded: false };
  }
}
