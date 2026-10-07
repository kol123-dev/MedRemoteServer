import { z } from 'zod';
import { Role } from '@prisma/client';

export const UserMeShape = z.object({
  id: z.string().uuid(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  tier: z.string(),
  atsScore: z.number().int().nullish(),
  skills: z.array(z.string()),
  subscriptionEndsAt: z.string().datetime().nullish(),
  profileHeadline: z.string().nullish(),
  phoneNumber: z.string(),
  email: z.string().nullish(),
  role: z.nativeEnum(Role),
  preferredCountries: z.array(z.string()).optional(),
  preferredShifts: z.array(z.string()).optional(),
  minMonthlyCompensation: z.number().nullish(),
});
export type UserMeShape = z.infer<typeof UserMeShape>;

export const JwtPayload = z.object({
  sub: z.string().uuid(),
  tier: z.string(),
  role: z.nativeEnum(Role),
  iat: z.number().optional(),
  exp: z.number().optional(),
});
export type JwtPayload = z.infer<typeof JwtPayload>;

export interface SavedJobSummary {
  id: string;
  jobId: string;
  title: string;
  company: string;
  category: string;
  savedAt: string;
}
