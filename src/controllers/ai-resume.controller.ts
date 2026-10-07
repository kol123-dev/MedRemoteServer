import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  analyzeResume,
  rewriteResumeForJob,
  exportResumeToBuffer,
} from '../services/ai/resume.service.js';
import type { HttpError } from '../middleware/error.middleware.js';

const prisma = new PrismaClient();

export class ResumeVersionNotFound extends Error implements HttpError {
  public readonly status = 404;
  public readonly code = 404;
  constructor() {
    super('Resume version not found or access denied');
    this.name = 'ResumeVersionNotFound';
  }
}

const DownloadTypeZod = z.enum(['PDF', 'DOCX']);

export const analyzeHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.sub;
  const { rawResumeText, format } = req.body as {
    rawResumeText?: string;
    format?: 'PDF' | 'DOCX' | 'TEXT';
  };

  // Source of truth: explicit upload text, else the user's stored resume text.
  let text: string | undefined = rawResumeText;
  if (!text || text.length < 50) {
    const stored = await prisma.user.findUnique({
      where: { id: userId },
      select: { rawResumeText: true },
    });
    text = stored?.rawResumeText ?? undefined;
  }

  if (!text || text.trim().length < 50) {
    res.status(400).json({
      error: 'Resume too short. Paste at least 50 characters of your resume or upload a file.',
      code: 400,
    });
    return;
  }

  const result = await analyzeResume(userId, text, format ?? 'TEXT');
  res.status(200).json({
    atsBreakdown: result.atsBreakdown,
    certificationsFound: result.certificationsFound,
    skillsFound: result.skillsFound,
    missingKeywords: result.missingKeywords,
    atsScore: result.atsScore,
    narrativeSummary: result.narrativeSummary,
  });
};

export const rewriteHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.sub;
  const { targetJobId, extraNotes } = req.body as {
    targetJobId?: string;
    rewriteMode?: string;
    extraNotes?: string;
  };

  const stored = await prisma.user.findUnique({
    where: { id: userId },
    select: { rawResumeText: true, jobTitleTarget: true },
  });

  let rawResume = stored?.rawResumeText ?? '';
  if (!rawResume || rawResume.trim().length < 50) {
    res.status(400).json({
      error: 'No resume on file. Upload or paste your resume first.',
      code: 400,
    });
    return;
  }

  // Optional: tailor to a specific job.
  let jobDescription: string | undefined;
  if (targetJobId) {
    const job = await prisma.job.findUnique({
      where: { id: targetJobId },
      select: { title: true, description: true, requirements: true, responsibilities: true },
    });
    if (job) {
      jobDescription = [job.title, job.description ?? '', job.requirements ?? '', job.responsibilities ?? '']
        .filter(Boolean)
        .join('\n\n');
    }
  }
  if (extraNotes) {
    rawResume = `${rawResume}\n\nEXTRA NOTES FROM CANDIDATE: ${extraNotes}`;
  }

  void stored;
  const result = await rewriteResumeForJob(userId, {
    rawResume,
    jobId: targetJobId,
    jobDescription,
  });

  res.status(201).json({
    rewrittenMarkdown: result.rewrittenMarkdown,
    atsScoreBefore: result.atsScoreBefore,
    atsScoreAfter: result.atsScoreAfter,
    diffSummary: result.diffSummary,
    llmAuditId: result.llmAuditId,
    versionNumber: result.versionNumber,
  });
};

export const downloadHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.sub;
  const { resumeVersionId } = req.params as { resumeVersionId: string };
  const rawType = (req.query.type as string | undefined) ?? 'PDF';
  const typeParsed = DownloadTypeZod.parse(rawType);

  const version = await prisma.resumeVersion.findUnique({
    where: { id: resumeVersionId },
    select: {
      id: true,
      userId: true,
      version: true,
      llmOutputMarkdown: true,
    },
  });

  if (!version || version.userId !== userId) {
    throw new ResumeVersionNotFound();
  }

  const buffer = await exportResumeToBuffer({
    markdown: version.llmOutputMarkdown,
    type: typeParsed,
    userId,
    version: version.version,
  });

  const filename = `resume-v${version.version}-${userId.slice(-5)}.${typeParsed.toLowerCase()}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', typeParsed === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.send(buffer);
};

export const historyHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.sub;
  const versions = await prisma.resumeVersion.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      version: true,
      sourceKind: true,
      roleTargetJobId: true,
      atsScoreSnapshot: true,
      modelName: true,
      createdAt: true,
    },
  });
  res.status(200).json({ versions });
};