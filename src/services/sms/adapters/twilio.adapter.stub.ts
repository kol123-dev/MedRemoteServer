import type { SmsProvider, SmsProviderId, SentSmsResult, SmsSendOpts } from '../sms.provider.js';

function normalizePhone(to: string): string {
  let s = to.replace(/\s+/g, '').trim();
  if (s.startsWith('0')) s = '254' + s.slice(1);
  if (s.startsWith('+')) s = s.slice(1);
  return s;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

/**
 * Twilio stub adapter — Phase 1: commented out real Twilio SDK import, returns sent-status true only.
 * To ENABLE Twilio real SMS:
 *   1) In backend package.json add "twilio": "^5.4.0" as dep.
 *   2) npm install.
 *   3) Uncomment the twilioClient lines below (currently disabled for zero unused-deps clean install).
 *   4) Set env SMS_PROVIDER=twilio + fill TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
 *   —— NO controller / billing / notifications edits needed (pluggable per user spec request).
 */
export class TwilioAdapterStub implements SmsProvider {
  public readonly id: SmsProviderId = 'twilio';
  private cfg: TwilioConfig;

  constructor(cfg: TwilioConfig) {
    this.cfg = cfg;
    // REAL TWILIO SDK PLACEHOLDER (uncomment lines below after npm i twilio):
    // this.client = require('twilio')(cfg.accountSid, cfg.authToken);
  }

  async send(to: string, body: string, opts?: SmsSendOpts): Promise<SentSmsResult> {
    const recipient = normalizePhone(to);
    const fakeSid = 'SMtwiliostub-' + Math.random().toString(36).slice(2, 14);
    if (opts?.dryRun ?? false) {
      console.info(`[SMS:TWILIO:STUB-DRYRUN] -> +${recipient} | ${body.length} chars.`);
      return { provider: 'twilio', to: recipient, messageId: fakeSid, smsUnits: Math.ceil(body.length / 160) || 1, queued: true, delivered: true };
    }
    // REAL TWILIO CLIENT LINE (uncomment after install + env):
    // const message = await this.client.messages.create({ body, from: this.cfg.from, to: `+${recipient}` });
    // return { provider: 'twilio', to: recipient, messageId: message.sid, smsUnits: 1, queued: message.status !== 'failed', delivered: message.status === 'delivered' };
    console.warn('[SMS:TWILIO] Phase1 STUB ONLY — Twilio SDK import commented out. Return fake-delivered. To swap provider real: see comments inside twilio.adapter.stub.ts');
    return {
      provider: 'twilio',
      to: recipient,
      messageId: fakeSid,
      smsUnits: Math.ceil(body.length / 160) || 1,
      queued: true,
      delivered: true,
    };
  }

  async bulkSend(recipients: string[], body: string, opts?: SmsSendOpts): Promise<SentSmsResult[]> {
    const out: SentSmsResult[] = [];
    for (const r of recipients) out.push(await this.send(r, body, opts));
    return out;
  }
}
