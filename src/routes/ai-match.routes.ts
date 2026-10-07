import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTier } from '../middleware/auth.middleware.js';
import { validateQuery, validateParams } from '../middleware/validate.middleware.js';
import {
  listMatchesHandler,
  explainMatchHandler,
  triggerRecalcHandler,
} from '../controllers/ai-match.controller.js';
import { MatchListZod } from '../types/validation/ai.zod.js';

const router = Router();

const MatchIdParamsZod = z.object({
  matchId: z.string(),
});

router.get(
  '/',
  requireAuth(),
  validateQuery(MatchListZod),
  listMatchesHandler,
);

router.get(
  '/:matchId/explain',
  requireAuth(),
  validateParams(MatchIdParamsZod),
  explainMatchHandler,
);

router.post(
  '/recalc',
  requireAuth(),
  requireTier('FREE'),
  triggerRecalcHandler,
);

export default router;
