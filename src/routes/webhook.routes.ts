import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { createSubscriptionFromPaymentWebhookSuccess } from '../services/subscription.service.js';
import { PaymentTierId } from '../config/featureFlags.js';

const router = Router();
const prisma = new PrismaClient();

router.post('/payments/mpesa-callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;

    if (!body || !body.Body || !body.Body.stkCallback) {
      res.status(400).json({ error: 'Invalid callback data', code: 400 });
      return;
    }

    const stkCallback = body.Body.stkCallback;
    const { ResultCode, CheckoutRequestID, CallbackMetadata, ResultDesc } = stkCallback;

    const payment = await prisma.payment.findUnique({
      where: { checkoutRequestId: CheckoutRequestID },
      select: { id: true, userId: true, amount: true, amountKES: true, tier: true, mpesaReceiptNo: true, status: true, provider: true },
    });

    if (ResultCode === 0) {
      const items = CallbackMetadata?.Item ?? [];
      const receiptNo = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;
      const transAmount = items.find((i: any) => i.Name === 'Amount')?.Value;

      await prisma.payment.update({
        where: { checkoutRequestId: CheckoutRequestID },
        data: {
          status: 'SUCCESS',
          mpesaReceiptNo: receiptNo,
          amountKES: transAmount ? Number(transAmount) : undefined,
        },
      });

      if (payment) {
        const tier = (payment.tier as PaymentTierId) || 'BASIC';
        const amountKES = Number(transAmount ?? payment.amountKES ?? payment.amount ?? 0);
        const userId = payment.userId;

        await createSubscriptionFromPaymentWebhookSuccess({
          paymentId: payment.id,
          provider: 'mpesa',
          userId,
          tier,
          amountKES,
          mpesaReceiptNo: receiptNo,
        });
      }
    } else {
      await prisma.payment.update({
        where: { checkoutRequestId: CheckoutRequestID },
        data: { status: 'FAILED' },
      }).catch(() => {});

      console.warn('[webhook:mpesa-callback] M-Pesa payment failed', {
        CheckoutRequestID,
        ResultCode,
        ResultDesc,
      });
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error: any) {
    console.error('[webhook:mpesa-callback] Error processing callback:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: error.message || 'Internal Server Error' });
  }
});

router.post('/payments/paystack-verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    const secretKey = env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY || '';
    const rawBody = JSON.stringify(req.body);

    if (secretKey && signature) {
      const expectedSignature = crypto
        .createHmac('sha512', secretKey)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('[webhook:paystack-verify] Paystack signature mismatch');
        res.status(401).json({ success: false, error: 'Invalid signature' });
        return;
      }
    }

    const event = req.body?.event;
    const data = req.body?.data;

    if (!event || !data) {
      res.status(400).json({ success: false, error: 'Invalid Paystack event payload' });
      return;
    }

    if (event === 'charge.success') {
      const reference = data.reference as string;
      const amountLowestUnit = Number(data.amount ?? 0);
      const amountKES = amountLowestUnit / 100;
      const metadata = data.metadata || {};
      const userId = metadata.userId as string;
      const tier = (metadata.tier as PaymentTierId) || 'BASIC';
      const channel = data.channel as string;
      const gatewayResponse = data.gateway_response as string;

      let paymentId = '';
      if (reference) {
        const updated = await prisma.payment.updateMany({
          where: { checkoutRequestId: reference },
          data: {
            status: 'SUCCESS',
            amountKES,
            amount: amountKES,
            receiptUrl: data.receipt_url ?? undefined,
          },
        }).catch(() => ({ count: 0 }));

        if (updated.count === 0) {
          try {
            const created = await prisma.payment.create({
              data: {
                merchantRequestId: `paystack-merchant-${Date.now()}`,
                checkoutRequestId: reference,
                phoneNumber: metadata.phone || (data.customer?.phone as string) || 'unknown',
                amount: amountKES,
                amountKES,
                status: 'SUCCESS',
                userId,
                provider: 'paystack',
                tier,
                receiptUrl: data.receipt_url,
              },
            });
            paymentId = created.id;
          } catch (e) {
            const fallback = await prisma.payment.findUnique({
              where: { checkoutRequestId: reference },
              select: { id: true },
            });
            paymentId = fallback?.id ?? '';
          }
        } else {
          const fetched = await prisma.payment.findUnique({
            where: { checkoutRequestId: reference },
            select: { id: true },
          });
          paymentId = fetched?.id ?? '';
        }
      }

      if (userId && paymentId) {
        await createSubscriptionFromPaymentWebhookSuccess({
          paymentId,
          provider: 'paystack',
          userId,
          tier,
          amountKES,
        });
      }

      console.info('[webhook:paystack-verify] charge.success processed', {
        reference,
        amountKES,
        userId,
        tier,
        channel,
        gatewayResponse,
      });
    } else {
      console.info('[webhook:paystack-verify] Ignoring non-charge.success event', { event });
    }

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    console.error('[webhook:paystack-verify] Error processing Paystack webhook:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
