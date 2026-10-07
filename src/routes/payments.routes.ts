import { Router } from 'express';
import { stkPush, mpesaCallback } from '../controllers/payments.controller';

const router = Router();

router.post('/stk-push', stkPush);
router.post('/callback', mpesaCallback);

export default router;