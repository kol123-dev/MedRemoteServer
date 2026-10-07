import { Request, Response } from 'express';
import { getMe, patchMe, getCurrentTierStatus } from '../services/users.service.js';
import { UserPatchMeZod } from '../types/validation/auth.zod.js';

export const getMeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const me = await getMe(req.user.sub);
    res.status(200).json(me);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load profile';
    res.status(500).json({ error: message, code: 500 });
  }
};

export const patchMeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const body = UserPatchMeZod.parse(req.body);
    const updated = await patchMe(req.user.sub, {
      firstName: body.firstName,
      lastName: body.lastName,
      profileHeadline: body.profileHeadline,
      minMonthlyCompensation: body.minMonthlyCompensation,
      preferredShifts: body.preferredShifts,
      preferredCountries: body.preferredCountries,
      skills: body.skills,
    });
    res.status(200).json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile';
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
    } else if (message.includes('already in use')) {
      res.status(409).json({ error: message, code: 409 });
    } else {
      res.status(400).json({ error: message, code: 400 });
    }
  }
};

export const getTierStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const status = await getCurrentTierStatus(req.user.sub);
    res.status(200).json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load tier status';
    res.status(500).json({ error: message, code: 500 });
  }
};

export const getReferralDashboardStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      referralCode: null,
      clicks: 0,
      signUps: 0,
      conversions: 0,
      totalEarnedDecimal: 0,
      pendingPayoutDecimal: 0,
      paidOutDecimal: 0,
      tier: 'BRONZE',
      recentReferrals: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load referral stats';
    res.status(500).json({ error: message, code: 500 });
  }
};
