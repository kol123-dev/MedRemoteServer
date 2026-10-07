import { Router } from 'express';
import { signUp, signIn, googleSignIn, linkedInSignIn, refresh, revokeSessions } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { SignUpZod, SignInZod, GoogleSignInZod, LinkedInSignInZod } from '../types/validation/auth.zod.js';

const router = Router();

router.post('/signup', validateBody(SignUpZod), signUp);
router.post('/signin', validateBody(SignInZod), signIn);
router.post('/google', validateBody(GoogleSignInZod), googleSignIn);
router.post('/linkedin', validateBody(LinkedInSignInZod), linkedInSignIn);
router.post('/refresh', refresh);
router.post('/logout', requireAuth(), revokeSessions);

router.get('/me-stub', requireAuth(), (_req, res) => {
  res.status(200).json({ ok: true, user: (_req as unknown as { user: unknown }).user });
});

export default router;
