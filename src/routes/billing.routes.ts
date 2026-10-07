import { Router } from 'express';
import {
  listPlansHandler,
  initiateMpesaCheckout,
  initiateCardCheckout,
  listPaymentHistory,
  cancelSubscription,
} from '../controllers/billing.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/plans', listPlansHandler);
router.post('/stk', requireAuth(), initiateMpesaCheckout);
router.post('/card', requireAuth(), initiateCardCheckout);
router.get('/history', requireAuth(), listPaymentHistory);
router.post('/cancel', requireAuth(), cancelSubscription);

export default router;
