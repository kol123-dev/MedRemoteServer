import axios from 'axios';
import type { SmsProvider, SmsProviderId, SentSmsResult, SmsSendOpts } from '../sms.provider.js';

function normalizePhoneKe(to: string): string {
  let s = to.replace(/\s+/g, '').trim();
  if (s.startsWith('0')) s = '254' + s.slice(1);
  if (s.startsWith('+')) s = s.slice(1);
  return s;
}

export interface AfricasTalkingConfig {
  username: string;
  apiKey: string;
  defaultSenderId?: string;
  baseUrl?: string;
}

export class AfricasTalkingAdapter implements SmsProvider {
  public readonly id: SmsProviderId = 'africastalking';
  private cfg: AfricasTalkingConfig;
  private atClient?: { SMS: { send: (o: Record<string, unknown>) => Promise<unknown> } };

  constructor(cfg: AfricasTalkingConfig) {
    this.cfg = cfg;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SDK = require('africastalking');
      if (typeof SDK === 'function') {
        const client = SDK({ username: cfg.username, apiKey: cfg.apiKey });
        if (client && client.SMS) this.atClient = client;
      }
    } catch (e) {
      console.warn('[SMS:AT] SDK load failed, falling back to raw REST mode');
    }
  }

  async send(to: string, body: string, opts?: SmsSendOpts): Promise<SentSmsResult> {
    const recipient = normalizePhoneKe(to);
    const senderId = opts?.senderId ?? this.cfg.defaultSenderId ?? undefined;
    try {
      if (this.atClient) {
        const res = await this.atClient.SMS.send({
          to: `+${recipient}`,
          message: body,
          ...(senderId ? { from: senderId } : {}),
        }) as { SMSMessageData?: { Message?: string; Recipients?: Array<{ status: string; messageId?: string; cost?: string; number?: string }> } };
        const recipientEntry = res?.SMSMessageData?.Recipients?.[0];
        const ok = /^success|^sent/i.test(recipientEntry?.status ?? '');
        const units = 1;
        return {
          provider: 'africastalking',
          to: recipient,
          messageId: recipientEntry?.messageId,
          smsUnits: units,
          estimatedCostKES: recipientEntry?.cost ? Number(String(recipientEntry.cost).replace(/[^0-9.]/g, '')) || 0 : undefined,
          queued: ok,
          delivered: ok,
          error: ok ? undefined : recipientEntry?.status ?? 'unknown',
        };
      }
      // Raw REST fallback
      const base = this.cfg.baseUrl ?? 'https://api.sandbox.africastalking.com';
      const { data } = await axios.post(`${base}/version1/messaging`, new URLSearchParams({
        username: this.cfg.username,
        to: `+${recipient}`,
        message: body,
        ...(senderId ? { from: senderId } : {}),
      }).toString(), {
        headers: { apikey: this.cfg.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const recip = data?.SMSMessageData?.Recipients?.[0];
      const ok = /Success|Sent/i.test(recip?.status ?? '');
      return {
        provider: 'africastalking',
        to: recipient,
        messageId: recip?.messageId,
        smsUnits: 1,
        estimatedCostKES: recip?.cost ? Number(String(recip.cost).replace(/[^0-9.]/g, '')) || 0 : undefined,
        queued: ok,
        delivered: ok,
        error: ok ? undefined : recip?.status,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return { provider: 'africastalking', to: recipient, smsUnits: 0, queued: false, error: msg };
    }
  }

  async bulkSend(recipients: string[], body: string, opts?: SmsSendOpts): Promise<SentSmsResult[]> {
    const out: SentSmsResult[] = [];
    for (const r of recipients) out.push(await this.send(r, body, opts));
    return out;
  }
}
