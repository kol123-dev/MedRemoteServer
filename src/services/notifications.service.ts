import { PrismaClient, User } from '@prisma/client';
import { sendSms } from './sms/sms.provider.js';
import { SUBSCRIPTION_DURATION_DAYS_DEFAULT } from '../config/featureFlags.js';

const prisma = new PrismaClient();

export interface AppReminder {
  id: string;
  userId: string;
  kind: 'SUBSCRIPTION_RENEWAL_3D' | 'SUBSCRIPTION_EXPIRED_24H' | 'MPESA_STK_SUCCESS' | 'AFFILIATE_PAYOUT_APPROVED' | 'MATCH_94_NEW_JOB';
  payload?: Record<string, unknown>;
  createdAt: Date;
  fireAt: Date;
  sent: boolean;
  smsSent: boolean;
  appInboxDelivered: boolean;
}

const memoryQueue: AppReminder[] = [];

export async function queueReminder(
  userId: string,
  kind: AppReminder['kind'],
  fireAt: Date,
  payload?: Record<string, unknown>,
): Promise<AppReminder> {
  const r: AppReminder = {
    id: 'rem-' + Math.random().toString(36).slice(2, 12),
    userId,
    kind,
    payload,
    createdAt: new Date(),
    fireAt,
    sent: false,
    smsSent: false,
    appInboxDelivered: false,
  };
  memoryQueue.push(r);
  return r;
}

export async function sendWelcomeSubscriptionSms(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true, firstName: true, tier: true } });
    if (!user?.phoneNumber) return;
    const name = user.firstName ?? 'Friend';
    const body =
      `MedRemoteJobs Hi ${name}! Your ${(user.tier as string) ?? 'BASIC'} plan is ACTIVE. Resume rewrites: 10, 1-Click Apply: 30. Login https://medremote.vercel.app/dashboard. Reply HELP for support.`;
    const r = await sendSms(user.phoneNumber, body);
    console.info('[notifications:welcome-sms] sent', { provider: r.provider, smsUnits: r.smsUnits, ok: r.delivered });
  } catch (err) {
    console.error('[notifications:welcome-sms] failed, never throw from notifications:', err);
  }
}

export async function queueSubscriptionRenewalReminder(userId: string, subscriptionEndsAt: Date): Promise<void> {
  const fireAt = new Date(subscriptionEndsAt.getTime() - 3 * 24 * 60 * 60 * 1000);
  await queueReminder(userId, 'SUBSCRIPTION_RENEWAL_3D', fireAt, {
    renewalKES: 500,
    renewalDaysFromNow: 3,
    durationDays: SUBSCRIPTION_DURATION_DAYS_DEFAULT,
  });
}

export async function queueSuccessfulMpesaSms(userId: string, mpesaReceiptNo: string, amountKES: number): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true, firstName: true } });
    if (!user?.phoneNumber) return;
    const name = user.firstName ?? 'Customer';
    const body =
      `MedRemoteJobs M-Pesa paid. Receipt ${mpesaReceiptNo}, KES ${amountKES}. Welcome ${name} — renew at dashboard 3 days before expiry. DO NOT share PIN.`;
    await sendSms(user.phoneNumber, body);
  } catch (err) {
    console.error('[notifications:mpesa-sms] failed silently:', err);
  }
}

export async function processDueReminders(now = new Date()): Promise<Array<AppReminder>> {
  const fired: AppReminder[] = [];
  for (const r of memoryQueue) {
    if (r.sent) continue;
    if (r.fireAt.getTime() <= now.getTime()) {
      r.sent = true;
      r.appInboxDelivered = true;
      fired.push(r);
      if (r.kind === 'SUBSCRIPTION_RENEWAL_3D') {
        try {
          const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { phoneNumber: true, firstName: true } });
          if (u?.phoneNumber) {
            const daysLeft = 3;
            await sendSms(u.phoneNumber,
              `MedRemoteJobs Reminder: ${u.firstName ?? ''} your subscription expires in ${daysLeft} days. Pay KES 500 via M-Pesa on app now to keep 10 rewrites + 30 1-Click Apply`.trim());
            r.smsSent = true;
          }
        } catch {
          // never throw
        }
      }
    }
  }
  return fired;
}

export function listAppInboxForUser(userId: string): AppReminder[] {
  return memoryQueue
    .filter(r => r.userId === userId && r.appInboxDelivered)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
}
