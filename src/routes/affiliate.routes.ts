import { Router } from 'express';
import { z } from 'zod';
import {
  getOrCreateAffiliateCodeHandler,
  getDashboardStatsHandler,
  requestPayoutHandler,
  shareableWidgetHandler,
  trackClickHandler,
} from '../controllers/affiliate.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

const PayoutRequestZod = z.object({
  method: z.enum(['M-Pesa']).default('M-Pesa'),
});

const router = Router();

router.get('/t/:code', trackClickHandler);
router.get('/me/code', requireAuth(), getOrCreateAffiliateCodeHandler);
router.get('/me/stats', requireAuth(), getDashboardStatsHandler);
router.post('/me/payout-request', requireAuth(), validateBody(PayoutRequestZod), requestPayoutHandler);
router.get('/me/widget', requireAuth(), shareableWidgetHandler);

export default router;
