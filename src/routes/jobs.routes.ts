import { Router } from 'express';
import { getJobById, getAllJobs } from '../controllers/jobs.controller';
import {
  saveJob,
  unsaveJob,
  listSavedJobs,
  listSavedJobIds,
} from '../controllers/savedJobs.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Public job listing + detail.
router.get('/', getAllJobs);

// Authenticated saved-jobs endpoints. Defined before `/:id` so the literals
// ("saved", "saved/ids") are not swallowed by the param route.
router.get('/saved', requireAuth(), listSavedJobs);
router.get('/saved/ids', requireAuth(), listSavedJobIds);
router.post('/:id/save', requireAuth(), saveJob);
router.delete('/:id/save', requireAuth(), unsaveJob);

router.get('/:id', getJobById);

export default router;