import { z } from 'zod';

/** Known ATS types the adapter registry supports (extend as adapters are added). */
export const AtsTypeZod = z.enum(['greenhouse', 'lever']);

export const CreateAtsSourceZod = z.object({
  atsType: AtsTypeZod,
  token: z.string().trim().min(1, 'token is required'),
  name: z.string().trim().min(1, 'name is required'),
  origin: z.string().url().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const PatchAtsSourceZod = z
  .object({
    atsType: AtsTypeZod.optional(),
    token: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    origin: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine(o => Object.keys(o).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateAtsSourceInput = z.infer<typeof CreateAtsSourceZod>;
export type PatchAtsSourceInput = z.infer<typeof PatchAtsSourceZod>;