import { z } from 'zod';

export const RewriteMode = z.enum([
  'US_FORMAT_MAKEOVER',
  'KENYA_CERTS_MAP',
  'ACTION_VERBS',
  'ATS_KEYWORDS',
  'FULL_TAILORED_FOR_JOB',
]);
export type RewriteMode = z.infer<typeof RewriteMode>;

export interface AtsChecklistItem {
  label: string;
  ok: boolean;
  tip?: string;
}

export interface AtsAnalysis {
  atsScore: number;
  checklist: AtsChecklistItem[];
  extractedSkills: string[];
  extractedCertsNormalized: Array<{
    kenyanName: string;
    usMapped?: string;
    ukMapped?: string;
    euMapped?: string;
    yearObtained?: number;
  }>;
  actionVerbsFound: string[];
  keywordsHit: string[];
  keywordsMissing: string[];
  rawInputText: string;
}

export type ResumeSourceKind =
  | 'ORIGINAL_KENYAN_CV'
  | 'AI_REWRITE_US_FORMAT'
  | 'AI_REWRITE_ROLE_TAILORED';

export interface ResumeVersionSummary {
  id: string;
  version: number;
  sourceKind: ResumeSourceKind;
  roleTargetJobId?: string;
  atsScoreSnapshot: number;
  createdAt: string;
  pdfUrl?: string;
  docxUrl?: string;
}

export interface ResumeRewriteResult {
  versionId: string;
  markdown: string;
  atsScore: number;
  previousScore?: number;
  checklist: AtsChecklistItem[];
  version: number;
  pdfUrl?: string;
  docxUrl?: string;
}
