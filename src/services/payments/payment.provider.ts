import { env } from '../../config/env.js';
import { PaymentTierId } from '../../config/featureFlags.js';

export type ProviderId = 'mpesa' | 'paystack' | 'mock';

export interface CheckoutResult {
  checkoutId: string;
  providerReference: string;
  provider: ProviderId;
  checkoutRedirect?: string;
  pollingWaitMs: number;
}

export interface PaymentProviderAdapter {
  initiateCheckout(
    phone: string,
    amountKES: number,
    tier: PaymentTierId,
    userId: string,
    returnUrl?: string,
  ): Promise<CheckoutResult>;
  queryStatus(checkoutId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'>;
  refundPartial(paymentId: string, reason?: string): Promise<{ refunded: boolean }>;
}

function paymentProviderEnv(): ProviderId {
  const raw = (process.env.PAYMENT_PROVIDER ?? '').toLowerCase();
  if (raw === 'paystack') return 'paystack';
  if (raw === 'mock') return 'mock';
  return 'mpesa';
}

let cachedAdapter: PaymentProviderAdapter | null = null;
let cachedAdapterId: ProviderId | null = null;

export function resolveProvider(forceId?: ProviderId): PaymentProviderAdapter {
  const id: ProviderId = forceId ?? paymentProviderEnv();
  if (cachedAdapter && cachedAdapterId === id) return cachedAdapter;

  switch (id) {
    case 'mpesa':
      try {
        cachedAdapter = instantiateMpesaDaraja();
      } catch (e) {
        console.warn('[payment.provider] M-Pesa adapter unavailable, fallback paystack', e instanceof Error ? e.message : e);
        cachedAdapter = instantiatePaystackCard();
      }
      break;
    case 'paystack':
      cachedAdapter = instantiatePaystackCard();
      break;
    case 'mock':
    default:
      cachedAdapter = instantiateLogMock();
  }
  cachedAdapterId = id;
  return cachedAdapter!;
}

function instantiateMpesaDaraja(): PaymentProviderAdapter {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MpesaDarajaAdapter } = require('./adapters/mpesa-daraja.adapter.js');
  return new MpesaDarajaAdapter();
}

function instantiatePaystackCard(): PaymentProviderAdapter {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PaystackCardAdapter } = require('./adapters/paystack-card.adapter.js');
    return new PaystackCardAdapter({ secretKey: env.PAYSTACK_SECRET_KEY ?? '' });
  } catch (e) {
    console.warn('[payment.provider] Paystack adapter failed load, fallback logmock', e);
    return instantiateLogMock();
  }
}

function instantiateLogMock(): PaymentProviderAdapter {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LogMockPaymentAdapter } = require('./adapters/payments.log-mock.adapter.js');
  return new LogMockPaymentAdapter();
}

export async function initiateCheckoutMpesaFirst(
  phone: string,
  amountKES: number,
  tier: PaymentTierId,
  userId: string,
  providerId?: ProviderId,
  returnUrl?: string,
): Promise<CheckoutResult> {
  const desiredId: ProviderId = providerId ?? 'mpesa';
  if (desiredId === 'mpesa') {
    try {
      const mpesaAdapter = instantiateMpesaDaraja();
      const result = await mpesaAdapter.initiateCheckout(phone, amountKES, tier, userId, returnUrl);
      return result;
    } catch (mpesaErr) {
      console.warn('[payment.provider] M-Pesa STK unavailable, fallback to Paystack redirect', mpesaErr instanceof Error ? mpesaErr.message : mpesaErr);
      try {
        const paystackAdapter = instantiatePaystackCard();
        const fallback = await paystackAdapter.initiateCheckout(phone, amountKES, tier, userId, returnUrl);
        return fallback;
      } catch (paystackErr) {
        console.warn('[payment.provider] Paystack also unavailable, fallback mock', paystackErr);
        const mock = instantiateLogMock();
        return mock.initiateCheckout(phone, amountKES, tier, userId, returnUrl);
      }
    }
  }
  const adapter = resolveProvider(desiredId);
  return adapter.initiateCheckout(phone, amountKES, tier, userId, returnUrl);
}

export async function queryPaymentStatusWrapper(
  checkoutId: string,
  providerId: ProviderId,
): Promise<'PENDING' | 'SUCCESS' | 'FAILED'> {
  const adapter = resolveProvider(providerId);
  return adapter.queryStatus(checkoutId);
}

export async function triggerRefundStub(
  paymentId: string,
  reason?: string,
): Promise<{ refunded: boolean }> {
  const adapter = resolveProvider();
  return adapter.refundPartial(paymentId, reason);
}
