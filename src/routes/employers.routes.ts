import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  profileHandler,
  createJobHandler,
  listMyJobsHandler,
  toggleJobStatusHandler,
  getApplicantsHandler,
  purchaseCreditsHandler,
} from '../controllers/employers.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../middleware/validate.middleware.js';
import {
  CreateJobZod,
  ToggleJobStatusZod,
  JobParamsZod,
  PurchaseCreditsZod,
} from '../services/employers.service.js';

const router = Router();

const EMPLOYER_ROLES: Role[] = [
  Role.SUBSCRIBER,
  Role.ADMIN,
];

router.get(
  '/me/profile',
  requireAuth(),
  requireRole(...EMPLOYER_ROLES),
  profileHandler,
);

router.post(
  '/jobs',
  requireAuth(),
  requireRole(...EMPLOYER_ROLES),
  validateBody(CreateJobZod),
  createJobHandler,
);

router.get(
  '/jobs',
  requireAuth(),
  requireRole(...EMPLOYER_ROLES),
  listMyJobsHandler,
);

router.post(
  '/jobs/:jobId/toggle-status',
  requireAuth(),
  requireRole(...EMPLOYER_ROLES),
  validateParams(JobParamsZod),
  validateBody(ToggleJobStatusZod),
  toggleJobStatusHandler,
);

router.get(
  '/jobs/:jobId/applicants',
  requireAuth(),
  requireRole(...EMPLOYER_ROLES),
  validateParams(JobParamsZod),
  getApplicantsHandler,
);

router.post(
  '/credits/purchase',
  requireAuth(),
  requireRole(...EMPLOYER_ROLES),
  validateBody(PurchaseCreditsZod),
  purchaseCreditsHandler,
);

export default router;
