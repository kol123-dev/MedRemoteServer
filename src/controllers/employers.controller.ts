import { Request, Response } from 'express';
import {
  getEmployerProfileByUserId,
  createJob,
  listPostedJobs,
  toggleJobStatus,
  getApplicantsForJob,
  purchaseCredits,
  CreateJobZod,
  ToggleJobStatusZod,
  JobParamsZod,
  PurchaseCreditsZod,
} from '../services/employers.service.js';

export const profileHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const result = await getEmployerProfileByUserId(req.user.sub);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load employer profile';
    if (err instanceof Error && err.name === 'TierLimitExhausted') {
      res.status(402).json({ error: message, code: 402 });
      return;
    }
    res.status(500).json({ error: message, code: 500 });
  }
};

export const createJobHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const body = CreateJobZod.parse(req.body);
    const result = await createJob(req.user.sub, body);
    res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create job';
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
      return;
    }
    if (err instanceof Error && err.name === 'TierLimitExhausted') {
      res.status(402).json({ error: message, code: 402 });
      return;
    }
    res.status(400).json({ error: message, code: 400 });
  }
};

export const listMyJobsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const statusFilter = (req.query.status as 'ACTIVE' | 'PAUSED' | 'CLOSED') ?? 'ACTIVE';
    const validStatuses: Array<'ACTIVE' | 'PAUSED' | 'CLOSED'> = ['ACTIVE', 'PAUSED', 'CLOSED'];
    const status = validStatuses.includes(statusFilter) ? statusFilter : 'ACTIVE';
    const jobs = await listPostedJobs(req.user.sub, status);
    res.status(200).json({ jobs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load posted jobs';
    res.status(500).json({ error: message, code: 500 });
  }
};

export const toggleJobStatusHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const params = JobParamsZod.parse(req.params);
    const body = ToggleJobStatusZod.parse(req.body);
    const result = await toggleJobStatus(req.user.sub, params.jobId, body.status);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to toggle job status';
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
      return;
    }
    if (message.includes('Not authorized')) {
      res.status(403).json({ error: message, code: 403 });
      return;
    }
    if (message.includes('not found')) {
      res.status(404).json({ error: message, code: 404 });
      return;
    }
    res.status(400).json({ error: message, code: 400 });
  }
};

export const getApplicantsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const params = JobParamsZod.parse(req.params);
    const result = await getApplicantsForJob(req.user.sub, params.jobId);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load applicants';
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
      return;
    }
    if (message.includes('Not authorized')) {
      res.status(403).json({ error: message, code: 403 });
      return;
    }
    if (message.includes('not found')) {
      res.status(404).json({ error: message, code: 404 });
      return;
    }
    res.status(500).json({ error: message, code: 500 });
  }
};

export const purchaseCreditsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }
    const body = PurchaseCreditsZod.parse(req.body);
    const result = await purchaseCredits(req.user.sub, body.creditsPackId);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to initiate credit purchase';
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({ error: 'Validation failed', code: 400, details: (err as { issues: unknown }).issues });
      return;
    }
    res.status(400).json({ error: message, code: 400 });
  }
};
