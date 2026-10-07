import { aiComplete } from './llm.provider.js';
import { buildCoverLetterPrompt } from './prompts/coverletter.prompts.js';

export interface GenerateCoverLetterParams {
  applicationId?: string;
  jobId: string;
  resumeVersionNumber?: number;
  tailoredBullets?: string[];
  includeMissingSkillsAddress?: boolean;
}

export interface CoverLetterResult {
  coverLetterMarkdown: string;
  tokensUsed: number;
  llmAuditId: string;
}

export async function generateForApplication(
  userId: string,
  params: GenerateCoverLetterParams,
): Promise<CoverLetterResult> {
  const {
    applicationId,
    jobId,
    resumeVersionNumber,
    tailoredBullets = [],
    includeMissingSkillsAddress = true,
  } = params;

  void applicationId;
  void jobId;
  void resumeVersionNumber;
  void includeMissingSkillsAddress;

  const { prompt, system } = buildCoverLetterPrompt({
    userName: 'Candidate',
    userHeadline: '',
    atsScore: 0,
    userStoryNarrative: '',
    companyName: '',
    jobTitle: '',
    jobDescription: '',
    tailoredResumeBullets: tailoredBullets,
    missingSkillsHighlight: [],
  });

  const res = await aiComplete(prompt, system, {
    userId,
    feature: 'C_COVER_LETTER_GEN',
    temperature: 0.5,
    maxTokens: 1500,
  });

  return {
    coverLetterMarkdown: res.output,
    tokensUsed: res.promptTokens + res.outputTokens,
    llmAuditId: res.llmAuditId,
  };
}
