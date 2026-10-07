import { Router } from 'express';
import { z } from 'zod';
import {
  analyzeHandler,
  rewriteHandler,
  downloadHandler,
  historyHandler,
} from '../controllers/ai-resume.controller.js';
import { requireAuth, requireTier } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.middleware.js';
import {
  ResumeAnalyzeZod,
  ResumeRewriteZod,
} from '../types/validation/ai.zod.js';

const router = Router();

const ResumeVersionParamZod = z.object({
  resumeVersionId: z.string().min(3),
});

router.post(
  '/analyze',
  requireAuth(),
  validateBody(ResumeAnalyzeZod),
  analyzeHandler,
);

router.post(
  '/rewrite',
  requireAuth(),
  requireTier('BASIC'),
  validateBody(ResumeRewriteZod),
  rewriteHandler,
);

router.get(
  '/:resumeVersionId/download',
  requireAuth(),
  validateParams(ResumeVersionParamZod),
  downloadHandler,
);

router.get(
  '/history',
  requireAuth(),
  historyHandler,
);

export default router;
