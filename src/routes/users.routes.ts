import { Router } from 'express';
import {
  getMeHandler,
  patchMeHandler,
  getTierStatus,
  getReferralDashboardStats,
} from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { UserPatchMeZod } from '../types/validation/auth.zod.js';

const router = Router();

router.get('/me', requireAuth(), getMeHandler);
router.patch('/me', requireAuth(), validateBody(UserPatchMeZod), patchMeHandler);
router.get('/me/tier-status', requireAuth(), getTierStatus);
router.get('/me/referrals', requireAuth(), getReferralDashboardStats);

export default router;
