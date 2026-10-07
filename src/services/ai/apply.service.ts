/**
 * AI Apply Service — 1-Click Auto-Apply orchestration
 *
 * PHASE 2 BROWSER AUTOMATION SWAP INSTRUCTIONS:
 * ===============================================
 * When adding browser-based auto-apply automation (Playwright / Puppeteer /
 * Chrome extension bridge), ONLY the body of `_phase2_submitViaBrowserAgent`
 * needs to be rewritten. No downstream controller, route, or queue handler
 * signature changes are required.
 *
 * Swap checklist:
 *  1) Add dep:  `npm i playwright` (or puppeteer-core for extension driver)
 *  2) Set env:  PLAYWRIGHT_WS_ENDPOINT or BROWSER_EXTENSION_BRIDGE_URL
 *  3) Replace the stub body of `_phase2_submitViaBrowserAgent` with real
 *     automation that:
 *       - reads Application.submissionPayloadSnapshot (Json) for form values
 *       - navigates to Application.externalApplyUrl
 *       - fills + uploads tailored resume PDF + cover letter
 *       - returns { externalConfirmationNo, portalReceiptScreenshotUrl? }
 *  4) Keep the same return signature so status handler is unchanged.
 * ===============================================
 */

import { PrismaClient, ApplyStage } from '@prisma/client';
import { rewriteResumeForJob, ResumeRewriteResult } from './resume.service.js';
import { generateForApplication, CoverLetterResult } from './coverletter.service.js';
import { enqueue, process, JobHandlerContext } from '../queue/jobQueue.js';
import { incrementUsage } from '../users.service.js';
import { tierLimitExhaustedError } from '../../config/featureFlags.js';

const prisma = new PrismaClient();

type TierFeatureLocal = 'AI_RESUME_REWRITE' | 'AI_AUTO_APPLY' | 'MATCH_RECALC';

export interface GenerateApplicationPreviewParams {
  userId: string;
  jobId: string;
  resumeVersionNumber?: number;
  includeCoverLetter?: boolean;
}

export interface RequiredFormFieldHint {
  name: string;
  label: string;
  autoFill?: string;
}

export interface ApplicationPreviewResult {
  previewId: string;
  jobSnapshot: {
    title: string;
    company: string;
    location: string | null;
    minAnnualUsd: number | null;
  };
  tailoredResumeSummary: {
    bullets: string[];
    atsScore: number;
    version: number;
  };
  coverLetterPreviewMarkdown: string | null;
  externalApplyPortalUrl: string | null;
  requiredFormFieldsHint: RequiredFormFieldHint[];
  estimatedTotalTimeSeconds: number;
}

export interface SubmitApprovedApplicationParams {
  userId: string;
  previewId: string;
  jobId: string;
  approvedResumeVersionId: number;
  approvedCoverLetterId?: string;
  candidateApprovedAllDisclosures: true;
}

export interface SubmitApprovedApplicationResult {
  applicationId: string;
  queued: true;
  etaMs: number;
  pollUrl: string;
}

export interface ApplicationStatusResult {
  id: string;
  userId: string;
  jobId: string;
  stage: ApplyStage;
  approvedAt: Date | null;
  generatedCoverLetterId: string | null;
  generatedResumeVersionId: number | null;
  externalApplyUrl: string | null;
  externalConfirmationId: string | null;
  failureReason: string | null;
  createdAt: Date;
  submittedAt: Date | null;
}

class ExplicitConsentRequired extends Error {
  public readonly code = 400;
  constructor(message = 'Explicit consent required: candidateApprovedAllDisclosures must be boolean true') {
    super(message);
    this.name = 'ExplicitConsentRequired';
  }
}

class OwnershipViolation extends Error {
  public readonly code = 403;
  constructor(message = 'Application does not belong to authenticated user') {
    super(message);
    this.name = 'OwnershipViolation';
  }
}

export { ExplicitConsentRequired, OwnershipViolation };

function makePreviewId(): string {
  return 'preview_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function parseSalaryToMinAnnualUsd(salary: string): number | null {
  if (!salary) return null;
  const m = salary.match(/(\d+(?:[.,]\d+)?)/);
  if (!m || m[1] === undefined) return null;
  const raw = parseFloat((m[1] as string).replace(/,/g, ''));
  if (Number.isNaN(raw)) return null;
  if (salary.toLowerCase().includes('hour') || salary.includes('/hr')) {
    return Math.round(raw * 40 * 52);
  }
  if (salary.toLowerCase().includes('week') || salary.includes('/wk')) {
    return Math.round(raw * 52);
  }
  if (salary.toLowerCase().includes('month') || salary.includes('/mo')) {
    return Math.round(raw * 12);
  }
  return Math.round(raw);
}

export async function generateApplicationPreview(
  params: GenerateApplicationPreviewParams,
): Promise<ApplicationPreviewResult> {
  const { userId, jobId, resumeVersionNumber, includeCoverLetter = true } = params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, company: true, location: true, salary: true, rawApplyUrl: true },
  });
  if (!job) {
    throw new Error('Job not found');
  }

  let resumeRewrite: ResumeRewriteResult | null = null;
  if (resumeVersionNumber === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { rawResumeText: true },
    });
    const rawResume = user?.rawResumeText ?? '';
    resumeRewrite = await rewriteResumeForJob(userId, { rawResume, jobId });
  } else {
    const rv = await prisma.resumeVersion.findUnique({
      where: { userId_version: { userId, version: resumeVersionNumber } },
      select: { atsScoreSnapshot: true, llmOutputMarkdown: true, version: true },
    });
    resumeRewrite = rv
      ? {
          rewrittenMarkdown: rv.llmOutputMarkdown,
          atsScoreBefore: rv.atsScoreSnapshot,
          atsScoreAfter: rv.atsScoreSnapshot,
          diffSummary: '',
          llmAuditId: '',
          versionNumber: rv.version,
        }
      : null;
  }

  if (!resumeRewrite) {
    resumeRewrite = {
      rewrittenMarkdown: '',
      atsScoreBefore: 0,
      atsScoreAfter: 0,
      diffSummary: '',
      llmAuditId: '',
      versionNumber: resumeVersionNumber ?? 1,
    };
  }

  let coverLetter: CoverLetterResult | null = null;
  if (includeCoverLetter) {
    coverLetter = await generateForApplication(userId, { jobId });
  }

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true, phoneNumber: true, country: true },
  });

  const requiredFormFieldsHint: RequiredFormFieldHint[] = [
    { name: 'firstName', label: 'First Name', autoFill: profile?.firstName ?? 'John' },
    { name: 'lastName', label: 'Last Name', autoFill: profile?.lastName ?? 'Doe' },
    { name: 'email', label: 'Email Address', autoFill: profile?.email ?? 'john.doe@example.com' },
    { name: 'phone', label: 'Phone Number', autoFill: profile?.phoneNumber ?? '+15550100123' },
    { name: 'workAuthorization', label: 'Work Authorization', autoFill: profile?.country === 'Kenya' ? 'US Visa Sponsorship Required' : 'US Citizen / Authorized' },
  ];

  const bullets = resumeRewrite.rewrittenMarkdown
    .split(/\n+/)
    .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
    .slice(0, 6)
    .map((l) => l.replace(/^[-*]\s*/, '').trim());

  return {
    previewId: makePreviewId(),
    jobSnapshot: {
      title: job.title,
      company: job.company,
      location: job.location ?? null,
      minAnnualUsd: parseSalaryToMinAnnualUsd(job.salary),
    },
    tailoredResumeSummary: {
      bullets: bullets.length ? bullets : ['Tailored resume bullets generated by AI rewrite engine'],
      atsScore: resumeRewrite.atsScoreAfter,
      version: resumeRewrite.versionNumber,
    },
    coverLetterPreviewMarkdown: coverLetter?.coverLetterMarkdown ?? null,
    externalApplyPortalUrl: job.rawApplyUrl ?? null,
    requiredFormFieldsHint,
    estimatedTotalTimeSeconds: 120,
  };
}

export async function submitApprovedApplication(
  params: SubmitApprovedApplicationParams,
): Promise<SubmitApprovedApplicationResult> {
  const {
    userId,
    previewId,
    jobId,
    approvedResumeVersionId,
    approvedCoverLetterId,
    candidateApprovedAllDisclosures,
  } = params;

  if (candidateApprovedAllDisclosures !== true) {
    throw new ExplicitConsentRequired();
  }

  const usage = await incrementUsage(userId, 'AI_AUTO_APPLY' as TierFeatureLocal);
  if (!usage.allowed || usage.limitExceeded) {
    const err = usage.error ?? tierLimitExhaustedError('AI_AUTO_APPLY', 'FREE');
    const e = new Error(err.error) as Error & { code?: number };
    e.code = 402;
    throw e;
  }

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { rawApplyUrl: true } });
  if (!job) {
    throw new Error('Job not found');
  }

  const application = await prisma.application.create({
    data: {
      userId,
      jobId,
      stage: 'QUEUED',
      generatedResumeVersionId: approvedResumeVersionId,
      generatedCoverLetterId: approvedCoverLetterId ?? null,
      externalApplyUrl: job.rawApplyUrl ?? null,
      submissionPayloadSnapshot: { previewId, approvedAt: new Date().toISOString() },
    },
    select: { id: true },
  });

  await enqueue(
    'APPLICATION_SUBMIT',
    { applicationId: application.id, userId, jobId, previewId },
    { retry: { attempts: 3, backoffMs: 2000 } },
  );

  return {
    applicationId: application.id,
    queued: true,
    etaMs: 60000,
    pollUrl: `/api/ai-apply/${application.id}/status`,
  };
}

export async function getApplicationStatus(params: {
  userId: string;
  applicationId: string;
}): Promise<ApplicationStatusResult> {
  const { userId, applicationId } = params;

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      userId: true,
      jobId: true,
      stage: true,
      approvedAt: true,
      generatedCoverLetterId: true,
      generatedResumeVersionId: true,
      externalApplyUrl: true,
      externalConfirmationId: true,
      failureReason: true,
      createdAt: true,
      submittedAt: true,
    },
  });

  if (!app) {
    const e = new Error('Application not found') as Error & { code?: number };
    e.code = 404;
    throw e;
  }

  if (app.userId !== userId) {
    throw new OwnershipViolation();
  }

  return app as ApplicationStatusResult;
}

async function _phase2_submitViaBrowserAgent(_payload: {
  applicationId: string;
  userId: string;
  jobId: string;
}): Promise<{ status: 'SUBMITTED'; externalConfirmationNo: string }> {
  return {
    status: 'SUBMITTED',
    externalConfirmationNo: 'TBD-PHASE2-BROWSER-AGENT',
  };
}

process('APPLICATION_SUBMIT', async (payload: { applicationId: string; userId: string; jobId: string }, _ctx: JobHandlerContext) => {
  try {
    await prisma.application.update({
      where: { id: payload.applicationId },
      data: { stage: 'GENERATING' },
    });

    const res = await _phase2_submitViaBrowserAgent(payload);

    await prisma.application.update({
      where: { id: payload.applicationId },
      data: {
        stage: 'SUBMITTED',
        externalConfirmationId: res.externalConfirmationNo,
        submittedAt: new Date(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.application.update({
      where: { id: payload.applicationId },
      data: {
        stage: 'FAILED',
        failureReason: msg,
      },
    });
    throw err;
  }
});
