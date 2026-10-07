import { z } from 'zod';
import { RewriteMode } from '../ai.types.js';

export const ResumeAnalyzeZod = z.object({
  rawResumeText: z.string().min(50).max(20000).optional(),
  format: z.enum(['PDF', 'DOCX', 'TEXT']).default('TEXT'),
  fromOnboardingJson: z.record(z.unknown()).optional(),
  forceRefresh: z.coerce.boolean().default(false),
});
export type ResumeAnalyzeZod = z.infer<typeof ResumeAnalyzeZod>;

export const ResumeRewriteZod = z.object({
  targetJobId: z.string().uuid().optional(),
  rewriteMode: RewriteMode,
  extraNotes: z.string().max(2000).optional(),
});
export type ResumeRewriteZod = z.infer<typeof ResumeRewriteZod>;

export const MatchListZod = z.object({
  limit: z.coerce.number().int().positive().max(500).default(30),
  category: z.string().max(40).optional(),
  minPct: z.coerce.number().int().min(0).max(100).default(30),
});

export const CreateApplicationZod = z.object({
  jobId: z.string().uuid().min(5),
  autoApprove: z.coerce.boolean().default(false),
  extraNotes: z.string().max(2000).optional(),
});
export type CreateApplicationZod = z.infer<typeof CreateApplicationZod>;

export const BillingCheckoutZod = z.object({
  tier: z.enum(['FREE', 'BASIC', 'PREMIUM', 'LIFETIME']),
  paymentProvider: z.enum(['mpesa', 'paystack', 'promocode']),
  phoneNumber: z.string().regex(/^(\+?254|0)\d{9}$/).optional(),
  promocode: z.string().max(24).optional(),
  returnUrl: z.string().url().optional(),
});
export type BillingCheckoutZod = z.infer<typeof BillingCheckoutZod>;
