import { Request, Response } from 'express';
import { z } from 'zod';
import {
  ensureAffiliateForUser,
  trackClick,
  getDashboardStats,
  requestPayout as affiliateServiceRequestPayout,
} from '../services/affiliate.service.js';
import { env } from '../config/env.js';

export const getOrCreateAffiliateCodeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const { affiliate } = await ensureAffiliateForUser(req.user.sub);
    res.status(200).json({
      code: affiliate.referralCode,
      referralLink: affiliate.referralLink,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get affiliate code';
    if (message.includes('already taken') || message.includes('must be 6-12')) {
      res.status(400).json({ error: message, code: 400 });
    } else {
      res.status(500).json({ error: message, code: 500 });
    }
  }
};

export const getDashboardStatsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const stats = await getDashboardStats(req.user.sub);
    res.status(200).json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard stats';
    res.status(500).json({ error: message, code: 500 });
  }
};

const PayoutMethodZod = z.object({
  method: z.enum(['M-Pesa']).default('M-Pesa'),
});

export const requestPayoutHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const body = PayoutMethodZod.parse(req.body);
    const result = await affiliateServiceRequestPayout(req.user.sub, {
      method: body.method,
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to request payout';
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
    } else if (message.includes('threshold') || message.includes('not yet met')) {
      res.status(400).json({ error: message, code: 400 });
    } else {
      res.status(500).json({ error: message, code: 500 });
    }
  }
};

export const shareableWidgetHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const { affiliate } = await ensureAffiliateForUser(req.user.sub);
    const html = `<!-- MedRemote Affiliate Share Widget -->
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; padding: 24px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); border-radius: 16px; color: white; box-shadow: 0 10px 40px rgba(0,0,0,0.15);">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
    <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🏥</div>
    <div>
      <div style="font-size: 18px; font-weight: 700;">MedRemote Affiliate</div>
      <div style="font-size: 13px; opacity: 0.85;">Kenya → Global Medical Jobs</div>
    </div>
  </div>
  <div style="background: rgba(0,0,0,0.25); padding: 14px; border-radius: 10px; margin-bottom: 16px;">
    <div style="font-size: 12px; opacity: 0.75; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Your Referral Code</div>
    <div style="font-size: 26px; font-weight: 800; letter-spacing: 4px; font-family: 'Courier New', monospace;">${affiliate.referralCode}</div>
  </div>
  <div style="font-size: 14px; line-height: 1.5; margin-bottom: 16px; opacity: 0.95;">
    Invite friends to MedRemote. Earn <strong>20% commission</strong> on every subscription payment.
  </div>
  <a href="${affiliate.referralLink}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; background: white; color: #1e3a8a; padding: 12px 20px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 15px;">
    Share Your Link →
  </a>
  <div style="margin-top: 14px; font-size: 12px; opacity: 0.7; text-align: center; word-break: break-all;">
    ${affiliate.referralLink}
  </div>
</div>`;
    res.status(200).type('text/html').send(html);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate widget';
    res.status(500).json({ error: message, code: 500 });
  }
};

export const trackClickHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawCode = req.params.code;
    const code = typeof rawCode === 'string' ? rawCode : Array.isArray(rawCode) ? rawCode[0] : undefined;
    if (!code) {
      res.status(400).json({ error: 'Referral code required', code: 400 });
      return;
    }

    const xfwd = req.headers['x-forwarded-for'];
    const xfwdStr = typeof xfwd === 'string' ? xfwd : Array.isArray(xfwd) ? xfwd[0] : undefined;
    const ip =
      xfwdStr?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;
    const uaHeader = req.headers['user-agent'];
    const userAgent = typeof uaHeader === 'string' ? uaHeader : Array.isArray(uaHeader) ? uaHeader[0] : undefined;

    let referralLink: string;
    try {
      const result = await trackClick(code, { ip, userAgent });
      referralLink = result.referralLink;
    } catch (trackErr: unknown) {
      const statusCode =
        trackErr && typeof trackErr === 'object' && 'statusCode' in trackErr
          ? (trackErr as { statusCode: number }).statusCode
          : undefined;
      if (statusCode === 404) {
        res.status(404).type('text/html').send(`<!doctype html><html><head><title>Invalid Referral</title><meta http-equiv="refresh" content="0; url=${env.FRONTEND_URL}/signup"></head><body></body></html>`);
        return;
      }
      referralLink = `${env.FRONTEND_URL}/signup?ref=${encodeURIComponent(code)}`;
    }

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    res.cookie('mr_ref', code, {
      maxAge: THIRTY_DAYS_MS,
      httpOnly: false,
      sameSite: 'lax',
    });
    res.redirect(302, referralLink);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Redirect failed';
    res.status(500).json({ error: message, code: 500 });
  }
};
