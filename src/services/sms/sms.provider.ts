import { env, smsProviderId, isSmsEnabled } from '../../config/env.js';

export type SmsProviderId = 'log' | 'africastalking' | 'twilio';

export interface SentSmsResult {
  provider: SmsProviderId;
  to: string;
  messageId?: string;
  smsUnits: number;
  estimatedCostKES?: number;
  queued: boolean;
  delivered?: boolean;
  error?: string;
}

export interface SmsSendOpts {
  from?: string;
  senderId?: string;
  callbackUrl?: string;
  skipQueue?: boolean;
  enqueueAt?: Date;
  dryRun?: boolean;
}

export interface SmsProvider {
  readonly id: SmsProviderId;
  send(toPhoneE164: string, bodyPlainText: string, opts?: SmsSendOpts): Promise<SentSmsResult>;
  bulkSend(recipients: string[], body: string, opts?: SmsSendOpts): Promise<SentSmsResult[]>;
}

// ---------- PUBLIC WRAPPER used by ALL other services.
// Controllers and services NEVER import an adapter directly.
// They only import sendSms / queueSms below.
// ------------------------------------------------------

let cachedProvider: SmsProvider | null = null;
let cachedProviderLastId: SmsProviderId | null = null;

export function resolveProvider(forceId?: SmsProviderId): SmsProvider {
  const id = forceId ?? smsProviderId();
  if (cachedProvider && cachedProviderLastId === id) return cachedProvider;

  switch (id) {
    case 'africastalking':
      cachedProvider = instantiateAfricaTalking();
      break;
    case 'twilio':
      cachedProvider = instantiateTwilioStub();
      break;
    case 'log':
    default:
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { LogSmsAdapter } = require('./adapters/logsms.adapter.js');
      cachedProvider = new LogSmsAdapter();
  }
  cachedProviderLastId = id;
  return cachedProvider!;
}

function instantiateAfricaTalking(): SmsProvider {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AfricasTalkingAdapter } = require('./adapters/africastalking.adapter.js');
    return new AfricasTalkingAdapter({
      username: env.AT_USERNAME,
      apiKey: env.AT_API_KEY ?? '',
      defaultSenderId: env.AT_SENDER_ID,
    });
  } catch (e) {
    console.warn('[sms.provider] Falling back to LogSmsAdapter; could not load AfricasTalking:', e instanceof Error ? e.message : e);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LogSmsAdapter } = require('./adapters/logsms.adapter.js');
    return new LogSmsAdapter();
  }
}

function instantiateTwilioStub(): SmsProvider {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TwilioAdapterStub } = require('./adapters/twilio.adapter.stub.js');
    return new TwilioAdapterStub({
      accountSid: env.TWILIO_ACCOUNT_SID ?? '',
      authToken: env.TWILIO_AUTH_TOKEN ?? '',
      from: env.TWILIO_FROM ?? '',
    });
  } catch (e) {
    console.warn('[sms.provider] Twilio stub failed load, fallback log', e);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LogSmsAdapter } = require('./adapters/logsms.adapter.js');
    return new LogSmsAdapter();
  }
}

export async function sendSms(
  toPhoneRaw: string,
  bodyPlainText: string,
  opts?: SmsSendOpts,
): Promise<SentSmsResult> {
  const dry = opts?.dryRun ?? false;
  if (!isSmsEnabled() && !dry) {
    const fallback: SmsProvider = (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { LogSmsAdapter } = require('./adapters/logsms.adapter.js');
      return new LogSmsAdapter();
    })();
    return fallback.send(toPhoneRaw, bodyPlainText, { ...opts, dryRun: true });
  }
  const p = resolveProvider();
  return p.send(toPhoneRaw, bodyPlainText, opts);
}

export async function sendSmsBulk(recipients: string[], body: string, opts?: SmsSendOpts): Promise<SentSmsResult[]> {
  if (!isSmsEnabled() && !opts?.dryRun) {
    const fallback: SmsProvider = (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { LogSmsAdapter } = require('./adapters/logsms.adapter.js');
      return new LogSmsAdapter();
    })();
    return fallback.bulkSend(recipients, body, { ...opts, dryRun: true });
  }
  const p = resolveProvider();
  return p.bulkSend(recipients, body, opts);
}
