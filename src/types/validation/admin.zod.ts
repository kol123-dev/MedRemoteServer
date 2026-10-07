import { z } from 'zod';
import { Role } from '@prisma/client';
import { PaymentTierId } from '../../config/featureFlags.js';

const RoleEnum = z.enum([Role.USER, Role.SUBSCRIBER, Role.ADMIN]);

// ---- Users ----
export const UserListQueryZod = z.object({
  search: z.string().max(100).optional(),
  role: z.enum([Role.USER, Role.SUBSCRIBER, Role.ADMIN]).optional(),
  tier: PaymentTierId.optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true'))
    .pipe(z.boolean().optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminUserCreateZod = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phoneNumber: z.string().min(6).max(20),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(8).max(100),
  role: RoleEnum.default('USER'),
});

export const AdminUserUpdateZod = z
  .object({
    firstName: z.string().min(1).max(80).optional(),
    lastName: z.string().min(1).max(80).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phoneNumber: z.string().min(6).max(20).optional(),
    role: RoleEnum.optional(),
    tier: PaymentTierId.optional(),
    password: z.string().min(8).max(100).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field to update required' });

export const UserActiveZod = z.object({ active: z.boolean() });

export const BulkUserActiveZod = z.object({
  ids: z.array(z.string().min(3)).min(1).max(200),
  active: z.boolean(),
});

// ---- LLM providers ----
export const LlmProviderCreateZod = z.object({
  provider: z.enum(['openai', 'anthropic', 'gemini']),
  label: z.string().min(2).max(120),
  baseUrl: z.string().url().optional().or(z.literal('')),
  defaultModel: z.string().min(1).max(120),
  apiKey: z.string().min(6).max(500).optional(),
  accessRoles: z.array(RoleEnum).min(0).default(['USER', 'SUBSCRIBER', 'ADMIN']),
  priority: z.number().int().min(0).max(9999).optional(),
  maxTokensLimit: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const LlmProviderUpdateZod = z
  .object({
    label: z.string().min(2).max(120).optional(),
    baseUrl: z.string().url().optional().or(z.literal('')),
    defaultModel: z.string().min(1).max(120).optional(),
    apiKey: z.string().min(6).max(500).optional(),
    accessRoles: z.array(RoleEnum).optional(),
    priority: z.number().int().min(0).max(9999).optional(),
    maxTokensLimit: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field to update required' });

export const LlmUsageQueryZod = z.object({
  model: z.string().max(120).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// ---- System config ----
export const ConfigUpsertZod = z.object({
  key: z.string().min(2).max(120).regex(/^[A-Za-z0-9_.-]+$/, 'Invalid key — letters, numbers, _ . - only'),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['string', 'number', 'boolean', 'json', 'secret']),
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown()), z.array(z.unknown()), z.null()]),
  isPublic: z.boolean().optional(),
  isEditable: z.boolean().optional(),
});

export const RestoreConfigZod = z.object({
  overwrite: z.boolean().optional(),
  snapshot: z.object({
    configs: z.array(
      z.object({
        key: z.string().min(2).max(120),
        name: z.string().max(120).optional(),
        description: z.string().max(2000).nullable().optional(),
        type: z.enum(['string', 'number', 'boolean', 'json', 'secret']),
        value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown()), z.array(z.unknown()), z.null()]),
        isPublic: z.boolean().optional(),
        isEditable: z.boolean().optional(),
      }),
    ),
  }),
});

// ---- Audit / dashboard ----
export const AuditListQueryZod = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(80).optional(),
  actorUserId: z.string().max(80).optional(),
  targetType: z.string().max(80).optional(),
});

export const IdParamZod = z.object({ id: z.string().min(3) });

// ---- Jobs & ATS ----
export const AdminJobsQueryZod = z.object({
  search: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  sourceAgency: z.string().max(120).optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true'))
    .pipe(z.boolean().optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const JobActiveZod = z.object({ active: z.boolean() });

export const AtsSourceCreateZod = z.object({
  atsType: z.string().min(1).max(60),
  token: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  origin: z.string().url().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

export const AtsSourcePatchZod = z
  .object({
    atsType: z.string().min(1).max(60),
    token: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    origin: z.string().url().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field to update required' });

export default {
  UserListQueryZod,
  AdminUserCreateZod,
  AdminUserUpdateZod,
  UserActiveZod,
  BulkUserActiveZod,
  LlmProviderCreateZod,
  LlmProviderUpdateZod,
  LlmUsageQueryZod,
  ConfigUpsertZod,
  RestoreConfigZod,
  AuditListQueryZod,
  IdParamZod,
  AdminJobsQueryZod,
  JobActiveZod,
  AtsSourceCreateZod,
  AtsSourcePatchZod,
};