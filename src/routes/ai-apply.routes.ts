import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTier } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.middleware.js';
import {
  createPreviewHandler,
  approveSubmitHandler,
  getStatusHandler,
  getHistoryHandler,
} from '../controllers/ai-apply.controller.js';
import { CreateApplicationZod } from '../types/validation/ai.zod.js';

const router = Router();

const PreviewBodyZod = CreateApplicationZod.extend({
  resumeVersionNumber: z.number().int().positive().optional(),
  includeCoverLetter: z.boolean().optional(),
}).omit({ autoApprove: true, extraNotes: true });

const ApproveSubmitBodyZod = z.object({
  previewId: z.string().min(8).max(128),
  jobId: z.string().uuid().min(5),
  approvedResumeVersionId: z.number().int().positive(),
  approvedCoverLetterId: z.string().uuid().optional(),
  candidateApprovedAllDisclosures: z.literal(true, {
    required_error: 'candidateApprovedAllDisclosures must be explicitly true (legal consent required)',
    invalid_type_error: 'candidateApprovedAllDisclosures must be boolean true, not a truthy value or default',
  }),
});

const ApplicationStatusParamsZod = z.object({
  applicationId: z.string().uuid().min(5),
});

router.post(
  '/preview',
  requireAuth(),
  requireTier('BASIC'),
  validateBody(PreviewBodyZod),
  createPreviewHandler,
);

router.post(
  '/confirm-approve-submit',
  requireAuth(),
  requireTier('BASIC'),
  validateBody(ApproveSubmitBodyZod),
  approveSubmitHandler,
);

router.get(
  '/:applicationId/status',
  requireAuth(),
  validateParams(ApplicationStatusParamsZod),
  getStatusHandler,
);

router.get(
  '/history',
  requireAuth(),
  getHistoryHandler,
);

export default router;
