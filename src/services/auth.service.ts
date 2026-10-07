import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
import { PrismaClient, AppSource, Role, PaymentTier } from '@prisma/client';
import { OAuth2Client, LoginTicket } from 'google-auth-library';
import { env } from '../config/env.js';
import { JwtPayload } from '../types/user.types.js';
import { SignUpZod as SignUpZodType, SignInZod as SignInZodType } from '../types/validation/auth.zod.js';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '30d';
const JWT_ISSUER = 'medremote';
const JWT_AUDIENCE = 'medremote-frontend';

interface LruEntry {
  expiresAt: number;
}

class RefreshTokenBlacklist {
  private store: Map<string, LruEntry> = new Map();
  private readonly maxSize = 10000;
  private readonly ttlMs = 30 * 24 * 60 * 60 * 1000;

  add(token: string): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(token, { expiresAt: Date.now() + this.ttlMs });
    this.cleanupExpired();
  }

  has(token: string): boolean {
    this.cleanupExpired();
    const entry = this.store.get(token);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(token);
      return false;
    }
    return true;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }
}

const refreshBlacklist = new RefreshTokenBlacklist();

function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/\s/g, '').replace(/-/g, '');
  if (cleaned.startsWith('+254')) {
    cleaned = '254' + cleaned.slice(4);
  } else if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  }
  return cleaned;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePasswords(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signJwtAccess(userId: string, tier: string, role: string): string {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: userId,
    tier,
    role: role as Role,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function signJwtRefresh(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyJwt<T>(token: string, secret: string): T {
  return jwt.verify(token, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as T;
}

interface ReqContext {
  ip?: string;
  ua?: string;
}

interface SignUpInput {
  email?: string;
  phoneNumber?: string;
  password: string;
  firstName: string;
  lastName: string;
  country?: string;
  source?: AppSource;
  referralCode?: string;
}

interface AuthResult {
  user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
  accessToken: string;
  refreshToken: string;
}

interface GoogleAuthResult {
  user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
}

export async function signUp(
  input: SignUpInput & { source?: AppSource },
  reqCtx?: ReqContext,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  const normalizedPhone = input.phoneNumber ? normalizePhone(input.phoneNumber) : undefined;

  if (normalizedPhone) {
    const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
    if (existingPhone) {
      throw new Error('Phone number already registered');
    }
  }

  if (input.email) {
    const existingEmail = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingEmail) {
      throw new Error('Email already registered');
    }
  }

  if (!normalizedPhone) {
    throw new Error('Phone number is required');
  }

  const now = new Date();

  const user = await prisma.user.create({
    data: {
      email: input.email ?? null,
      phoneNumber: normalizedPhone,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      country: input.country ?? null,
      source: input.source ?? AppSource.ONBOARDING_FORM,
      tier: PaymentTier.FREE,
      role: Role.USER,
      lastLoggedInAt: now,
      createdAt: now,
    },
  });

  if (input.referralCode) {
    const affiliate = await prisma.affiliate.findUnique({
      where: { referralCode: input.referralCode },
    });
    if (affiliate) {
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { clicks: { increment: 1 } },
      });
      await prisma.referralEvent.create({
        data: {
          affiliateId: affiliate.id,
          referredUserId: user.id,
          kind: 'SIGNUP',
          ip: reqCtx?.ip ?? null,
          ua: reqCtx?.ua ?? null,
        },
      });
    }
  }

  const accessToken = signJwtAccess(user.id, user.tier, user.role);
  const refreshToken = signJwtRefresh(user.id);

  return { user, accessToken, refreshToken };
}

interface SignInInput {
  emailOrPhone: string;
  password: string;
}

export async function signInWithPassword(
  input: SignInInput,
  reqCtx?: ReqContext,
): Promise<AuthResult> {
  const { emailOrPhone, password } = input;

  const looksLikePhone = /^(\+?254|0)?\d{9}$/.test(emailOrPhone.replace(/\s|-/g, ''));
  const normalizedLookup = looksLikePhone ? normalizePhone(emailOrPhone) : emailOrPhone;

  let user;
  if (looksLikePhone) {
    user = await prisma.user.findUnique({ where: { phoneNumber: normalizedLookup } });
  }
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: emailOrPhone } });
  }
  if (!user) {
    throw new Error('Invalid credentials');
  }

  if (!user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const ok = await comparePasswords(password, user.passwordHash);
  if (!ok) {
    throw new Error('Invalid credentials');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoggedInAt: new Date() },
  });

  const accessToken = signJwtAccess(updated.id, updated.tier, updated.role);
  const refreshToken = signJwtRefresh(updated.id);

  void reqCtx;
  return { user: updated, accessToken, refreshToken };
}

export async function signInWithGoogle(
  idToken: string,
  reqCtx?: ReqContext,
): Promise<GoogleAuthResult> {
  let sub: string;
  let email: string | undefined;
  let name: string | undefined;
  let picture: string | undefined;

  if (env.GOOGLE_CLIENT_ID) {
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    let ticket: LoginTicket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
    } catch {
      throw new Error('Invalid Google ID token');
    }
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google ID token payload');
    }
    sub = payload.sub;
    email = payload.email;
    name = payload.name;
    picture = payload.picture;
  } else {
    try {
      const decoded = jwt.decode(idToken) as Record<string, unknown> | null;
      if (!decoded || typeof decoded.sub !== 'string') {
        throw new Error('GOOGLE_CLIENT_ID not configured and token decode failed');
      }
      sub = decoded.sub;
      email = typeof decoded.email === 'string' ? decoded.email : undefined;
      name = typeof decoded.name === 'string' ? decoded.name : undefined;
      picture = typeof decoded.picture === 'string' ? decoded.picture : undefined;
    } catch {
      throw new Error('GOOGLE_CLIENT_ID not configured and cannot verify token');
    }
  }

  let firstName: string | undefined;
  let lastName: string | undefined;
  if (name) {
    const parts = name.split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ') || undefined;
  }

  let user = await prisma.user.findUnique({ where: { googleId: sub } });

  let isNewUser = false;
  const now = new Date();

  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: sub, lastLoggedInAt: now },
      });
    }
  }

  if (!user) {
    isNewUser = true;
    let phoneBase = '254' + Math.floor(100000000 + Math.random() * 900000000).toString();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.user.findUnique({ where: { phoneNumber: phoneBase } });
      if (!existing) break;
      phoneBase = '254' + Math.floor(100000000 + Math.random() * 900000000).toString();
      attempts++;
    }

    user = await prisma.user.create({
      data: {
        googleId: sub,
        email: email ?? null,
        phoneNumber: phoneBase,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        source: AppSource.GOOGLE,
        tier: PaymentTier.FREE,
        role: Role.USER,
        lastLoggedInAt: now,
        createdAt: now,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoggedInAt: now },
    });
  }

  const accessToken = signJwtAccess(user.id, user.tier, user.role);
  const refreshToken = signJwtRefresh(user.id);

  void picture;
  void reqCtx;
  return { user, isNewUser, accessToken, refreshToken };
}

/**
 * Verify a LinkedIn OpenID Connect `id_token` and return its claims.
 *
 * LinkedIn issues RS256-signed JWTs. We validate signature against LinkedIn's
 * published public keys (JWKS), then enforce `iss`, `aud` and expiry — matching
 * the way Google's id_token is validated but via a JWKS endpoint.
 */
interface LinkedInClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

const LINKEDIN_JWKS_URL = 'https://www.linkedin.com/oauth/v2/publickeys';
const LINKEDIN_ISS = 'https://www.linkedin.com/oauth';

/** Minimal JWK shape returned by LinkedIn's JWKS endpoint. */
interface LinkedinJwk {
  [key: string]: unknown;
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

const jwksCache: { keys: LinkedinJwk[]; fetchedAt: number } | null = null;

function jwkToPem(jwk: LinkedinJwk): string {
  const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
  return keyObject.export({ type: 'spki', format: 'pem' }).toString();
}

async function fetchLinkedInPublicKeys(): Promise<LinkedinJwk[]> {
  if (jwksCache && jwksCache.fetchedAt > Date.now() - 3600_000) {
    return jwksCache.keys;
  }
  const res = await fetch(LINKEDIN_JWKS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error('Unable to fetch LinkedIn public keys');
  }
  const body = (await res.json()) as { keys?: LinkedinJwk[] };
  const keys = body.keys ?? [];
  if (!keys.length) {
    throw new Error('LinkedIn JWKS returned no keys');
  }
  (jwksCache as { keys: LinkedinJwk[]; fetchedAt: number }) = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyLinkedInIdToken(idToken: string): Promise<LinkedInClaims> {
  const unverified = jwt.decode(idToken, { complete: true }) as
    | { header: { kid?: string }; payload: LinkedInClaims }
    | null;
  if (!unverified?.payload || !unverified.header) {
    throw new Error('Invalid LinkedIn ID token');
  }
  const claims = unverified.payload;
  if (claims.iss !== LINKEDIN_ISS) {
    throw new Error('Invalid LinkedIn issuer');
  }
  const expectedAud = env.LINKEDIN_CLIENT_ID;
  if (expectedAud) {
    const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!aud.includes(expectedAud)) {
      throw new Error('Invalid LinkedIn audience');
    }
  }
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    throw new Error('LinkedIn ID token expired');
  }

  const kid = unverified.header.kid;
  const keys = await fetchLinkedInPublicKeys();
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Error('No matching LinkedIn public key');
  }
  const pem = jwkToPem(key);
  jwt.verify(idToken, pem, { algorithms: ['RS256'] });
  return claims;
}

export async function signInWithLinkedIn(
  idToken: string,
  reqCtx?: ReqContext,
): Promise<GoogleAuthResult> {
  const payload = await verifyLinkedInIdToken(idToken);

  const sub = payload.sub;
  const email = payload.email;
  const firstName = payload.given_name || payload.name?.split(' ')[0];
  const lastName = payload.family_name || (payload.name?.split(' ').slice(1).join(' ') || undefined);
  const picture = payload.picture;

  let user = await prisma.user.findUnique({ where: { linkedinId: sub } });

  let isNewUser = false;
  const now = new Date();

  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { linkedinId: sub, lastLoggedInAt: now },
      });
    }
  }

  if (!user) {
    isNewUser = true;
    let phoneBase = '254' + Math.floor(100000000 + Math.random() * 900000000).toString();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.user.findUnique({ where: { phoneNumber: phoneBase } });
      if (!existing) break;
      phoneBase = '254' + Math.floor(100000000 + Math.random() * 900000000).toString();
      attempts++;
    }

    user = await prisma.user.create({
      data: {
        linkedinId: sub,
        email: email ?? null,
        phoneNumber: phoneBase,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        source: AppSource.LINKEDIN,
        tier: PaymentTier.FREE,
        role: Role.USER,
        lastLoggedInAt: now,
        createdAt: now,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoggedInAt: now },
    });
  }

  const accessToken = signJwtAccess(user.id, user.tier, user.role);
  const refreshToken = signJwtRefresh(user.id);

  void picture;
  void reqCtx;
  return { user, isNewUser, accessToken, refreshToken };
}

interface RefreshResult {
  accessToken: string;
  newRefreshToken: string;
  user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
}

export async function refreshTokenRotate(refreshToken: string): Promise<RefreshResult> {
  if (refreshBlacklist.has(refreshToken)) {
    throw new Error('Refresh token has been revoked');
  }

  let decoded: { sub: string };
  try {
    decoded = verifyJwt<{ sub: string }>(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user) {
    throw new Error('User no longer exists');
  }

  refreshBlacklist.add(refreshToken);

  const accessToken = signJwtAccess(user.id, user.tier, user.role);
  const newRefreshToken = signJwtRefresh(user.id);

  return { accessToken, newRefreshToken, user };
}

export async function revokeRefresh(userId: string, tokenId?: string): Promise<void> {
  void userId;
  void tokenId;
  return Promise.resolve();
}
