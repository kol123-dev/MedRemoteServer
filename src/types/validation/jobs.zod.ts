import { z } from 'zod';

export const PostJobZod = z.object({
  title: z.string().min(3).max(140),
  company: z.string().min(2).max(80),
  companyUrl: z.string().url().optional(),
  salary: z.string().max(60).optional(),
  shift: z.string().max(60).optional(),
  qualification: z.string().max(200).optional(),
  rawApplyUrl: z.string().url(),
  category: z.enum([
    'Medical Scribe',
    'Medical Billing & Coding',
    'Medical Reception',
    'HVAC Intake',
    'Virtual Assistant',
    'Customer Support',
    'Administration',
  ]),
  description: z.string().min(20).max(20000),
  requirements: z.string().min(20).max(10000).optional(),
  responsibilities: z.string().min(20).max(10000).optional(),
  location: z.string().max(120).optional(),
  postedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type PostJobZod = z.infer<typeof PostJobZod>;

export const JobsFilterZod = z.object({
  category: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
  salaryMin: z.coerce.number().int().positive().optional(),
  shift: z.string().max(40).optional(),
  limit: z.coerce.number().int().positive().max(200).default(30),
  page: z.coerce.number().int().positive().default(1),
});
export type JobsFilterZod = z.infer<typeof JobsFilterZod>;
