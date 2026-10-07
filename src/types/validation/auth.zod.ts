import { z } from 'zod';

export const SignUpZod = z.object({
  email: z.string().email().optional(),
  phoneNumber: z.string().regex(/^(\+?254|0)\d{9}$/, 'Kenyan phone number format: +254, 0, or 254 + 9 digits').optional(),
  password: z.string().min(8, 'Password min 8 chars'),
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
}).refine(b => Boolean(b.email || b.phoneNumber), 'Either email or phone number required');
export type SignUpZod = z.infer<typeof SignUpZod>;

export const SignInZod = z.object({
  emailOrPhone: z.string().min(3),
  password: z.string().min(1),
});
export type SignInZod = z.infer<typeof SignInZod>;

export const GoogleSignInZod = z.object({
  idToken: z.string().min(10),
});

export const LinkedInSignInZod = z.object({
  idToken: z.string().min(10),
});

export const UserPatchMeZod = z.object({
  firstName: z.string().max(40).optional(),
  lastName: z.string().max(40).optional(),
  profileHeadline: z.string().max(200).optional(),
  country: z.string().max(40).optional(),
  preferredCountries: z.array(z.string()).optional(),
  preferredShifts: z.array(z.string()).optional(),
  minMonthlyCompensation: z.number().int().positive().optional(),
  rawResumeText: z.string().max(20000).optional(),
  skills: z.array(z.string()).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    year: z.number().int().optional(),
    mappedUsCert: z.string().optional(),
  })).optional(),
});
export type UserPatchMeZod = z.infer<typeof UserPatchMeZod>;
