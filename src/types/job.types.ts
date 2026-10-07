import type { ApplyStage } from '@prisma/client';
import { z } from 'zod';

type MatchReason = 'EXACT_SKILL' | 'CERT_EQUIVALENT' | 'KENYA_EXPERIENCE_MAPPED' | 'KEYWORD_HIT' | 'LOCATION_OPEN';

export interface SkillBreakdown {
  present: string[];
  missing: string[];
  niceToHave?: string[];
}

export interface MatchResult {
  id: string;
  jobId: string;
  overallPct: number;
  skillBreakdown: SkillBreakdown;
  reasons: MatchReason[];
  semanticScore?: number;
  keywordScore?: number;
  recalcVersion: number;
  expiresAt?: string;
  job: {
    id: string;
    title: string;
    company: string;
    category: string;
    salary?: string;
    shift?: string;
    location?: string;
    rawApplyUrl?: string;
  };
}

export interface MatchExplained extends MatchResult {
  narrative: string;
  weightedSkillGapsWithActions: Array<{ missingSkill: string; howToGet: string; estHoursToAcquire: number }>;
  percentTo100IfGapsClosed: number;
}

export interface ApplicationPreview {
  applicationId: string;
  stage: ApplyStage;
  jobTitle: string;
  companyName: string;
  coverLetterMarkdown: string;
  tailoredResumePdfUrl?: string;
  tailoredResumeDocxUrl?: string;
  tailoredResumeMarkdown?: string;
  formKeyValues: Record<string, string>;
  expiresAtPreview: string;
  approvalRequired: boolean;
}

export const MatchReasonZod = z.enum([
  'EXACT_SKILL',
  'CERT_EQUIVALENT',
  'KENYA_EXPERIENCE_MAPPED',
  'KEYWORD_HIT',
  'LOCATION_OPEN',
]);
