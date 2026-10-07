import { Router } from 'express';
import {
  createSourceHandler,
  deleteSourceHandler,
  listRegisteredTypesHandler,
  listSourcesHandler,
  patchSourceHandler,
  runSourceHandler,
} from '../controllers/ats-source.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { CreateAtsSourceZod, PatchAtsSourceZod } from '../types/validation/ats.zod.js';

const router = Router();

// Management of ATS ingestion sources. Admin-only.
router.get('/api/adapter-types', requireAuth(), requireRole('ADMIN'), listRegisteredTypesHandler);
router.get('/api/ats-sources', requireAuth(), requireRole('ADMIN'), listSourcesHandler);
router.post('/api/ats-sources', requireAuth(), requireRole('ADMIN'), validateBody(CreateAtsSourceZod), createSourceHandler);
router.patch('/api/ats-sources/:id', requireAuth(), requireRole('ADMIN'), validateBody(PatchAtsSourceZod), patchSourceHandler);
router.delete('/api/ats-sources/:id', requireAuth(), requireRole('ADMIN'), deleteSourceHandler);
router.post('/api/ats-sources/:id/run', requireAuth(), requireRole('ADMIN'), runSourceHandler);

export default router;