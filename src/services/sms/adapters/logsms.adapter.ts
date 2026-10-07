import type { SmsProvider, SmsProviderId, SentSmsResult, SmsSendOpts } from '../sms.provider.js';

function normalizePhone(to: string): string {
  let s = to.replace(/\s+/g, '').trim();
  if (s.startsWith('0')) s = '254' + s.slice(1);
  if (s.startsWith('+')) s = s.slice(1);
  return s;
}

export class LogSmsAdapter implements SmsProvider {
  public readonly id: SmsProviderId = 'log';
  send(to: string, body: string, opts?: SmsSendOpts): Promise<SentSmsResult> {
    const now = new Date().toISOString();
    const recipient = normalizePhone(to);
    if (opts?.dryRun ?? false) {
      console.info(`[SMS:LOG:DRY-RUN] [${now}] -> +${recipient} | len=${body.length}`);
    } else {
      console.info(`[SMS:LOG] [${now}] -> +${recipient} | ${body.split('\n')[0]?.slice(0, 80) ?? ''}...${body.length > 80 ? '' : ''}`);
    }
    return Promise.resolve({
      provider: 'log',
      to: recipient,
      messageId: 'LOG-' + Math.random().toString(36).slice(2, 12),
      smsUnits: Math.ceil(body.length / 160) || 1,
      estimatedCostKES: 0,
      queued: false,
      delivered: true,
    });
  }
  bulkSend(recipients: string[], body: string, opts?: SmsSendOpts): Promise<SentSmsResult[]> {
    return Promise.all(recipients.map(r => this.send(r, body, opts)));
  }
}
