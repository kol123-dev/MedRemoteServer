import { Request, Response } from 'express';
import {
  signUp as signUpService,
  signInWithPassword,
  signInWithGoogle,
  refreshTokenRotate,
  revokeRefresh,
} from '../services/auth.service.js';
import { SignUpZod, SignInZod, GoogleSignInZod } from '../types/validation/auth.zod.js';
import { writeAudit, AdminAction } from '../services/admin/audit.service.js';

const ACCESS_TOKEN_MAX_AGE_SEC = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SEC = 30 * 24 * 60 * 60;

function extractReqCtx(req: Request): { ip?: string; ua?: string } {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.ip ||
    undefined;
  const ua = req.headers['user-agent'] || undefined;
  return { ip, ua };
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('mr_jwt', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_MAX_AGE_SEC * 1000,
    path: '/',
  });
  res.cookie('mr_jwt_r', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC * 1000,
    path: '/',
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('mr_jwt', { path: '/' });
  res.clearCookie('mr_jwt_r', { path: '/' });
}

export const signUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = SignUpZod.parse(req.body);
    const ctx = extractReqCtx(req);

    const result = await signUpService(
      {
        email: body.email,
        phoneNumber: body.phoneNumber,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
      },
      ctx,
    );

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(201).json({
      accessToken: result.accessToken,
      user: result.user,
      expiresIn: ACCESS_TOKEN_MAX_AGE_SEC,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign up failed';
    if (message.includes('already registered') || message.includes('already in use')) {
      res.status(409).json({ error: message, code: 409 });
    } else if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
    } else {
      res.status(400).json({ error: message, code: 400 });
    }
  }
};

export const signIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = SignInZod.parse(req.body);
    const ctx = extractReqCtx(req);

    const result = await signInWithPassword(
      {
        emailOrPhone: body.emailOrPhone,
        password: body.password,
      },
      ctx,
    );

    setAuthCookies(res, result.accessToken, result.refreshToken);

    void writeAudit({
      context: { actorUserId: result.user?.id ?? null, ipAddress: ctx.ip, userAgent: ctx.ua },
      action: AdminAction.USER_SIGNIN,
      targetType: 'user',
      targetId: result.user?.id ?? undefined,
    });

    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
      expiresIn: ACCESS_TOKEN_MAX_AGE_SEC,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign in failed';
    if (message === 'Invalid credentials') {
      res.status(401).json({ error: message, code: 401 });
    } else {
      res.status(400).json({ error: message, code: 400 });
    }
  }
};

export const googleSignIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = GoogleSignInZod.parse(req.body);
    const ctx = extractReqCtx(req);

    const result = await signInWithGoogle(body.idToken, ctx);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    void writeAudit({
      context: { actorUserId: result.user?.id ?? null, ipAddress: ctx.ip, userAgent: ctx.ua },
      action: AdminAction.USER_SIGNIN,
      targetType: 'user',
      targetId: result.user?.id ?? undefined,
      meta: { via: 'google' },
    });

    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
      isNewUser: result.isNewUser,
      expiresIn: ACCESS_TOKEN_MAX_AGE_SEC,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Google sign in failed';
    res.status(400).json({ error: message, code: 400 });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    let refreshToken: string | undefined;
    const authHeader = req.headers.authorization ?? '';
    if (authHeader.startsWith('Bearer ')) {
      refreshToken = authHeader.slice(7);
    }
    if (!refreshToken) {
      refreshToken = req.cookies?.mr_jwt_r as string | undefined;
    }
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token required', code: 401 });
      return;
    }

    const result = await refreshTokenRotate(refreshToken);

    setAuthCookies(res, result.accessToken, result.newRefreshToken);

    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
      expiresIn: ACCESS_TOKEN_MAX_AGE_SEC,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Refresh failed';
    res.status(401).json({ error: message, code: 401 });
  }
};

export const revokeSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.sub) {
      await revokeRefresh(req.user.sub);
    }

    clearAuthCookies(res);

    res.status(200).json({ ok: true, message: 'Sessions revoked' });
  } catch (err: unknown) {
    clearAuthCookies(res);
    res.status(200).json({ ok: true, message: 'Sessions revoked' });
  }
};
