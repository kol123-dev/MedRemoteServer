import { PrismaClient } from '@prisma/client';
import { aiComplete } from './llm.provider.js';
import {
  buildResumeAnalyzePrompt,
  buildResumeRewritePrompt,
} from './prompts/resume.prompts.js';
import {
  extractSkillsFromText,
  flattenAtsKeywordsByCategory,
} from './skills.service.js';
import { KENYA_QUALIFICATIONS_MAP } from '../../lib/kenyaQualsMap.js';
import { ACTION_VERBS_ALL } from '../../lib/actionVerbs.js';
import type { ResumeSourceKind } from '../../types/ai.types.js';

const prisma = new PrismaClient();

export interface ResumeAtsBreakdownItem {
  label: string;
  ok: boolean;
  tip?: string;
}

export interface ResumeCertFound {
  kenyanName: string;
  usMapped?: string;
  ukMapped?: string;
  euMapped?: string;
  yearObtained?: number;
}

export interface ResumeAnalyzeResult {
  atsBreakdown: ResumeAtsBreakdownItem[];
  certificationsFound: ResumeCertFound[];
  skillsFound: string[];
  missingKeywords: string[];
  atsScore: number;
  narrativeSummary: string;
}

export interface ResumeRewriteResult {
  rewrittenMarkdown: string;
  atsScoreBefore: number;
  atsScoreAfter: number;
  diffSummary: string;
  llmAuditId: string;
  versionNumber: number;
}

/** Detect US-mapped certifications present in the candidate text. */
function detectCerts(rawText: string): ResumeCertFound[] {
  const lower = rawText.toLowerCase();
  const found: ResumeCertFound[] = [];
  for (const q of KENYA_QUALIFICATIONS_MAP) {
    const needle = q.kenyanName.toLowerCase().slice(0, 12);
    if (needle.length < 4) continue;
    if (lower.includes(needle)) {
      found.push({
        kenyanName: q.kenyanName,
        usMapped: q.usMapped,
        ukMapped: q.ukMapped,
        euMapped: q.euMapped,
      });
    }
  }
  return found.slice(0, 12);
}

/**
 * Deterministic ATS-quality review used as the baseline before (and guard after)
 * any LLM call. Keeps the score/checklist meaningful even if the LLM is slow.
 */
export function analyzeResumeLocally(
  rawText: string,
  targetRole?: string,
): {
  atsScore: number;
  atsBreakdown: ResumeAtsBreakdownItem[];
  skillsFound: string[];
  missingKeywords: string[];
  certsFound: ResumeCertFound[];
} {
  const skillsFound = extractSkillsFromText(rawText);
  const certsFound = detectCerts(rawText);

  const hasVerbs = ACTION_VERBS_ALL.filter((v) =>
    new RegExp(`\\b${v}\\b`, 'i').test(rawText),
  );
  const hasNumbers = /\d+%.*|\d+ patients|\d+ years|\d+ hrs|manage\w* \d+/i.test(rawText);

  // Keyword hits per skill category (hard/tools carry the most ATS weight).
  let hitCount = skillsFound.length;
  const bank = flattenAtsKeywordsByCategory(targetRole);
  const requiredPool = [...bank.hard, ...bank.tools];
  const missingKeywords = requiredPool
    .filter((kw) => !extractSkillsFromText(`${rawText} ${targetRole ?? ''}`).includes(kw))
    .slice(0, 12);

  const checklist: ResumeAtsBreakdownItem[] = [
    {
      label: 'Contact header (email/phone/location) detected',
      ok: /\S+@\S+\.\S+/.test(rawText) && /(\+?\d[\d\s-]{8,})/.test(rawText),
      tip: 'Add an email, phone, and city/country at the top.',
    },
    {
      label: 'US-style action verbs used',
      ok: hasVerbs.length >= 3,
      tip: `Use strong verbs — we found ${hasVerbs.length} (e.g. ${hasVerbs[0] ?? 'Led'}, ${hasVerbs[1] ?? 'Managed'}).`,
    },
    {
      label: 'Quantified impact (numbers, %, volume)',
      ok: hasNumbers,
      tip: 'Add metrics: "Triaged 45 patients/day", "cut turnaround 40%".',
    },
    {
      label: 'EHR / medical terminology keywords present',
      ok: skillsFound.some((s) => /EHR|epic|cerner|emr|athena|soap|documentation|triage|chart/i.test(s)),
      tip: 'Name your EHR (Epic, Cerner, athenahealth) and clinical tasks explicitly.',
    },
    {
      label: 'Kenyan certs mapped to US equivalents',
      ok: certsFound.length > 0,
      tip: certsFound.length && certsFound[0]
        ? `Mapped: ${certsFound[0].kenyanName} → ${certsFound[0].usMapped ?? 'US equivalent'}`
        : 'Add your KNCK/TVET registrations so we can map them to CMA/CCMA etc.',
    },
    {
      label: 'Keyword density is ATS-friendly (3-6 repeats, not sparse)',
      ok: hitCount >= 12,
      tip: `Model found ${hitCount} skill keyword hits. Aim for 12+ distinct keywords.`,
    },
  ];

  const okCount = checklist.filter((c) => c.ok).length;
  const ratio = okCount / checklist.length;
  const extra = Math.max(0, Math.min(20, hitCount * 2));
  const atsScore = Math.min(100, Math.round(ratio * 70 + extra));

  return { atsScore, atsBreakdown: checklist, skillsFound, missingKeywords, certsFound };
}

async function persistVersion(params: {
  userId: string;
  sourceKind: ResumeSourceKind;
  rawInputText: string;
  llmOutputMarkdown: string;
  promptSnapshot: string;
  modelName: string;
  tokensUsed: number;
  atsScoreSnapshot: number;
  roleTargetJobId?: string;
}): Promise<number> {
  const latest = await prisma.resumeVersion.aggregate({
    where: { userId: params.userId },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;

  const row = await prisma.resumeVersion.create({
    data: {
      userId: params.userId,
      version,
      sourceKind: params.sourceKind,
      roleTargetJobId: params.roleTargetJobId,
      rawInputText: params.rawInputText,
      llmOutputMarkdown: params.llmOutputMarkdown,
      promptSnapshot: params.promptSnapshot,
      modelName: params.modelName,
      tokensUsed: params.tokensUsed,
      atsScoreSnapshot: params.atsScoreSnapshot,
    },
    select: { version: true },
  });

  return row.version;
}

export async function analyzeResume(
  userId: string,
  rawText: string,
  format: 'PDF' | 'DOCX' | 'TEXT',
): Promise<ResumeAnalyzeResult> {
  const local = analyzeResumeLocally(rawText);

  const { prompt, system } = buildResumeAnalyzePrompt(rawText);

  let narrativeSummary = local.atsBreakdown[0]?.tip ?? '';
  let modelName = 'deterministic';
  let tokensUsed = 0;

  try {
    const res = await aiComplete(prompt, system, {
      userId,
      feature: 'C_COVER_LETTER_GEN',
      temperature: 0.2,
      maxTokens: 800,
    });
    modelName = res.model;
    tokensUsed = res.promptTokens + res.outputTokens;
    try {
      const parsed = JSON.parse(res.output) as {
        atsScore?: number;
        atsBreakdown?: ResumeAtsBreakdownItem[];
        certificationsFound?: ResumeCertFound[];
        skillsFound?: string[];
        missingKeywords?: string[];
        narrativeSummary?: string;
      };
      if (parsed.narrativeSummary) narrativeSummary = parsed.narrativeSummary;
      if (typeof parsed.atsScore === 'number') local.atsScore = parsed.atsScore;
      if (Array.isArray(parsed.atsBreakdown)) local.atsBreakdown = parsed.atsBreakdown;
    } catch {
      // fall back to the deterministic review
    }
  } catch (e) {
    console.warn('[resume.service] analyze LLM failed, using deterministic:', e instanceof Error ? e.message : e);
  }

  const snapshot = JSON.stringify({ atsBreakdown: local.atsBreakdown, atsScore: local.atsScore });
  await persistVersion({
    userId,
    sourceKind: 'ORIGINAL_KENYAN_CV',
    rawInputText: rawText,
    llmOutputMarkdown: rawText,
    promptSnapshot: `${snapshot}\n${format}`,
    modelName,
    tokensUsed,
    atsScoreSnapshot: local.atsScore,
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      rawResumeText: rawText,
      atsScore: local.atsScore,
    },
  }).catch(() => undefined);

  return {
    atsBreakdown: local.atsBreakdown,
    certificationsFound: local.certsFound,
    skillsFound: local.skillsFound,
    missingKeywords: local.missingKeywords,
    atsScore: local.atsScore,
    narrativeSummary,
  };
}

export async function rewriteResumeForJob(
  userId: string,
  params: { rawResume: string; jobId?: string; jobDescription?: string },
): Promise<ResumeRewriteResult> {
  const { rawResume, jobId, jobDescription } = params;

  const before = analyzeResumeLocally(rawResume);

  const atsKeywordsByCategory = Object.fromEntries(
    ['Medical Scribe', 'Medical Billing & Coding', 'Medical Reception / Virtual Assistant', 'HVAC / Building Services / Chiller Systems', 'Customer Support / Call Center / Insurance', 'Administration / Operations / Executive VA'].map((cat) => [cat, flattenAtsKeywordsByCategory(cat)]),
  );

  const kenyaQualsMapRawHints = KENYA_QUALIFICATIONS_MAP.map(
    (q) => `${q.kenyanName} → US: ${q.usMapped ?? '—'} | UK: ${q.ukMapped ?? '—'} | EU: ${q.euMapped ?? '—'}`,
  ).join('\n');

  const { prompt, system } = buildResumeRewritePrompt({
    kenyaQualsMapRawHints,
    atsKeywordsByCategory,
    actionVerbsList: [...ACTION_VERBS_ALL],
    rawResume,
    targetJobDesc: jobDescription,
  });

  let rewrittenMarkdown = '';
  let modelName = 'deterministic';
  let tokensUsed = 0;
  let llmAuditId = '';

  try {
    const res = await aiComplete(prompt, system, {
      userId,
      feature: 'A_RESUME_REWRITE',
      temperature: 0.4,
      maxTokens: 4096,
    });
    rewrittenMarkdown = res.output.trim();
    modelName = res.model;
    tokensUsed = res.promptTokens + res.outputTokens;
    llmAuditId = res.llmAuditId;
  } catch (e) {
    console.warn('[resume.service] rewrite LLM failed:', e instanceof Error ? e.message : e);
    throw e;
  }

  if (!rewrittenMarkdown) {
    rewrittenMarkdown = rawResume;
  }

  const after = analyzeResumeLocally(rewrittenMarkdown, jobDescription ? undefined : undefined);
  const sourceKind: ResumeSourceKind = jobDescription
    ? 'AI_REWRITE_ROLE_TAILORED'
    : 'AI_REWRITE_US_FORMAT';

  const version = await persistVersion({
    userId,
    sourceKind,
    roleTargetJobId: jobId,
    rawInputText: rawResume,
    llmOutputMarkdown: rewrittenMarkdown,
    promptSnapshot: prompt.slice(0, 6000),
    modelName,
    tokensUsed,
    atsScoreSnapshot: after.atsScore,
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      rewrittenResumeMarkdown: rewrittenMarkdown,
      atsScore: after.atsScore,
    },
  }).catch(() => undefined);

  const diffSummary = after.atsScore > before.atsScore
    ? `ATS-score improved from ${before.atsScore}% to ${after.atsScore}%.`
    : after.atsScore === before.atsScore
    ? `Score held steady at ${after.atsScore}% — mostly US-wording improvements.`
    : `Score ${before.atsScore}% — mostly US-wording improvements; hard skill gaps remain.`;

  return {
    rewrittenMarkdown,
    atsScoreBefore: before.atsScore,
    atsScoreAfter: after.atsScore,
    diffSummary,
    llmAuditId,
    versionNumber: version,
  };
}

export async function exportResumeToBuffer(params: {
  markdown: string;
  type: 'PDF' | 'DOCX';
  userId: string;
  version: number;
}): Promise<Buffer> {
  const { markdown, type } = params;
  const { generatePdfFromMarkdown } = await import('../../lib/pdfExporter.js');
  const { generateDocxFromMarkdown } = await import('../../lib/docxExporter.js');
  if (type === 'PDF') {
    return generatePdfFromMarkdown(markdown);
  }
  return generateDocxFromMarkdown(markdown);
}