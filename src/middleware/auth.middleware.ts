import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role } from '@prisma/client';
import { env } from '../config/env.js';
import { JwtPayload } from '../types/user.types.js';
import { caps, tierOf, tierLimitExhaustedError, PaymentTierId, hasSufficientTier } from '../config/featureFlags.js';

const prisma = new PrismaClient();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        caps?: ReturnType<typeof caps>;
      };
    }
  }
}

export function requireAuth(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization ?? '';
      let token: string | undefined;
      if (header.startsWith('Bearer ')) {
        token = header.slice(7);
      }
      if (!token) {
        const cookieToken = req.cookies?.mr_jwt as string | undefined;
        token = cookieToken;
      }
      if (!token) {
        res.status(401).json({ error: 'Authentication required. Use Authorization: Bearer <JWT> or mr_jwt cookie.', code: 401 });
        return;
      }
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { id: true, tier: true, role: true, isActive: true } });
      if (!user) {
        res.status(401).json({ error: 'User no longer exists', code: 401 });
        return;
      }
      if (user.isActive === false) {
        res.status(403).json({ error: 'Account deactivated — contact support', code: 403 });
        return;
      }
      const t = tierOf({ tier: (user.tier ?? 'FREE') as never });
      req.user = {
        sub: user.id,
        tier: t,
        role: (user.role as Role) ?? 'USER',
      };
      req.user.caps = caps({ tier: t as never });
      next();
    } catch (err: unknown) {
      const msg = err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError ? 'Bad or expired token — sign in again' : 'Auth failed';
      res.status(403).json({ error: msg, code: 403 });
    }
  };
}

export function requireTier(required: PaymentTierId): RequestHandler {
  return (req, res, next): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Auth required' });
      return;
    }
    const t = (req.user.tier as PaymentTierId) ?? 'FREE';
    if (!hasSufficientTier({ tier: t as never }, required)) {
      const r = tierLimitExhaustedError('minimum-tier-requirement', t);
      res.status(402).json(r);
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Auth required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Role insufficient' });
      return;
    }
    next();
  };
}
