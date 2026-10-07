import { Request, Response } from 'express';
import {
  generateApplicationPreview,
  submitApprovedApplication,
  getApplicationStatus,
  ExplicitConsentRequired,
  OwnershipViolation,
} from '../services/ai/apply.service.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function extractUserId(req: Request): string {
  if (!req.user?.sub) {
    const e = new Error('Authentication required') as Error & { code?: number };
    e.code = 401;
    throw e;
  }
  return req.user.sub;
}

export const createPreviewHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req);
    const body = req.body as {
      jobId: string;
      resumeVersionNumber?: number;
      includeCoverLetter?: boolean;
    };

    const result = await generateApplicationPreview({
      userId,
      jobId: body.jobId,
      resumeVersionNumber: body.resumeVersionNumber,
      includeCoverLetter: body.includeCoverLetter ?? true,
    });

    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as Error & { code?: number };
    const code = e.code ?? (err instanceof Error && err.message === 'Job not found' ? 404 : 400);
    res.status(code).json({ error: e.message, code });
  }
};

export const approveSubmitHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req);
    const body = req.body as {
      previewId: string;
      jobId: string;
      approvedResumeVersionId: number;
      approvedCoverLetterId?: string;
      candidateApprovedAllDisclosures: true;
    };

    const result = await submitApprovedApplication({
      userId,
      previewId: body.previewId,
      jobId: body.jobId,
      approvedResumeVersionId: body.approvedResumeVersionId,
      approvedCoverLetterId: body.approvedCoverLetterId,
      candidateApprovedAllDisclosures: body.candidateApprovedAllDisclosures,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof ExplicitConsentRequired) {
      res.status(400).json({ error: err.message, code: 400 });
      return;
    }
    const e = err as Error & { code?: number };
    const code = e.code ?? 400;
    res.status(code).json({ error: e.message, code });
  }
};

export const getStatusHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req);
    const applicationId = Array.isArray(req.params.applicationId)
      ? String(req.params.applicationId[0])
      : String(req.params.applicationId ?? '');

    const result = await getApplicationStatus({ userId, applicationId });

    res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof OwnershipViolation) {
      res.status(403).json({ error: err.message, code: 403 });
      return;
    }
    const e = err as Error & { code?: number };
    const code = e.code ?? 400;
    res.status(code).json({ error: e.message, code });
  }
};

export const getHistoryHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req);

    const applications = await prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(applications);
  } catch (err: unknown) {
    const e = err as Error & { code?: number };
    const code = e.code ?? 500;
    res.status(code).json({ error: e.message ?? 'Failed to load application history', code });
  }
};
