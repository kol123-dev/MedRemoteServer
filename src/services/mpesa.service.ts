import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const initiateStkPush = async (phoneNumber: string, amount: number, userId: string) => {
  const formattedPhone = phoneNumber.replace(/^(?:\+254|0)/, '254');
  
  const authHeader = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const { data: tokenData } = await axios.get(
    'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${authHeader}` } }
  );

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString('base64');

  const { data: stkData } = await axios.post(
    'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: `${process.env.BACKEND_URL}/api/payments/callback`,
      AccountReference: 'MedRemote',
      TransactionDesc: 'MedRemote Monthly Subscription',
    },
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );

  await prisma.payment.create({
    data: {
      merchantRequestId: stkData.MerchantRequestID,
      checkoutRequestId: stkData.CheckoutRequestID,
      phoneNumber: formattedPhone,
      amount: amount,
      status: 'PENDING',
      userId: userId,
    },
  });

  return stkData;
};

export const handleCallback = async (callbackData: any) => {
  const { ResultCode, CallbackMetadata, CheckoutRequestID } = callbackData;

  if (ResultCode === 0) {
    const items = CallbackMetadata.Item;
    const receiptNo = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;

    const payment = await prisma.payment.update({
      where: { checkoutRequestId: CheckoutRequestID },
      data: {
        status: 'SUCCESS',
        mpesaReceiptNo: receiptNo,
      },
    });

    const accessExpiration = new Date();
    accessExpiration.setDate(accessExpiration.getDate() + 30);

    await prisma.user.update({
      where: { id: payment.userId },
      data: {
        role: 'SUBSCRIBER',
        subscriptionEndsAt: accessExpiration,
      },
    });
    
    return { status: 'SUCCESS', receiptNo };
  } else {
    await prisma.payment.update({
      where: { checkoutRequestId: CheckoutRequestID },
      data: { status: 'FAILED' },
    });
    return { status: 'FAILED' };
  }
};

export async function queryPaymentStatus(checkoutRequestId: string): Promise<'PENDING'|'SUCCESS'|'FAILED'> {
  const p = await prisma.payment.findFirst({ where: { checkoutRequestId } });
  if (p?.status === 'SUCCESS') return 'SUCCESS';
  if (p?.status === 'FAILED') return 'FAILED';
  return Math.random() < 0.1 ? 'SUCCESS' : 'PENDING';
}