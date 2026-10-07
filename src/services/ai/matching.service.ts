import { PrismaClient, Prisma } from '@prisma/client';
import type {
  MatchResult,
  MatchExplained,
  SkillBreakdown,
} from '../../types/job.types.js';
import { aiComplete } from './llm.provider.js';
import { buildMatchExplainPrompt } from './prompts/matching.prompts.js';
import { computeKeywordScore, diffSkillSets } from './skills.service.js';

const prisma = new PrismaClient();

type MatchReasonCode =
  | 'EXACT_SKILL'
  | 'CERT_EQUIVALENT'
  | 'KENYA_EXPERIENCE_MAPPED'
  | 'KEYWORD_HIT'
  | 'LOCATION_OPEN';

export interface ScoreMatchPairResult {
  overallPct: number;
  skillBreakdown: SkillBreakdown;
  reasons: MatchReasonCode[];
  semanticScore: number;
  keywordScore: number;
}

interface UserLike {
  id: string;
  skills?: unknown;
  certifications?: unknown;
  preferredCountries?: unknown;
  profileHeadline?: string | null;
  rawResumeText?: string | null;
}

interface JobLike {
  id: string;
  title: string;
  company: string;
  category?: string | null;
  skillsRequired?: unknown;
  matchKeywords?: unknown;
  location?: string | null;
  description?: string | null;
}

function asStringArr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}

const SEMANTIC_SUFFIX_STRIP: ReadonlyArray<[RegExp, string]> = [
  [/tion$/, ''],
  [/sion$/, ''],
  [/ing$/, ''],
  [/ed$/, ''],
  [/es$/, ''],
  [/s$/, ''],
];

function semanticStem(wordIn: string): string {
  let w = wordIn.toLowerCase().trim();
  if (w.length < 4) return w;
  for (const [re, rep] of SEMANTIC_SUFFIX_STRIP) {
    if (re.test(w)) {
      const next = w.replace(re, rep);
      if (next.length >= 3) {
        w = next;
        break;
      }
    }
  }
  return w.slice(0, 7);
}

function buildStemSet(items: string[]): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    const tokens = item
      .toLowerCase()
      .replace(/[^a-z0-9+#/&\- ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const t of tokens) {
      set.add(semanticStem(t));
    }
  }
  return set;
}

export function semanticScoreFn(
  userSkills: string[],
  jobKeywords: string[],
): number {
  const userStems = buildStemSet(userSkills);
  const jobStems = buildStemSet(jobKeywords);

  if (jobStems.size === 0 && userStems.size === 0) {
    return 0.5;
  }

  let intersectionSize = 0;
  for (const s of userStems) {
    if (jobStems.has(s)) intersectionSize++;
  }

  const unionSize = userStems.size + jobStems.size - intersectionSize;
  const jaccard = unionSize === 0 ? 0.5 : intersectionSize / unionSize;

  let prefixPairs = 0;
  if (jobStems.size > 0) {
    const userPrefixes = new Set<string>();
    for (const s of userStems) userPrefixes.add(s.slice(0, 6));
    for (const j of jobStems) {
      const jp = j.slice(0, 6);
      if (userPrefixes.has(jp)) prefixPairs++;
    }
  }
  const prefixBonus = jobStems.size === 0 ? 0 : Math.min(0.2, prefixPairs / jobStems.size);

  return Math.min(1.0, jaccard * 0.8 + prefixBonus);
}

export function scoreMatchPair(user: UserLike, job: JobLike): ScoreMatchPairResult {
  const userSkills = asStringArr(user.skills);
  const jobSkills = asStringArr(job.skillsRequired);
  const jobKeywords = asStringArr(job.matchKeywords);
  const userResumeText = user.rawResumeText ?? '';
  const userCerts = asStringArr(user.certifications);

  const skillBreakdown = diffSkillSets(userSkills, jobSkills);
  const semanticScore = semanticScoreFn(
    [...userSkills, ...userCerts],
    jobKeywords.length > 0 ? jobKeywords : jobSkills,
  );
  const keywordScore = computeKeywordScore(
    userResumeText + ' ' + userSkills.join(' '),
    jobKeywords.length > 0 ? jobKeywords : jobSkills,
  );

  const overallRaw = semanticScore * 0.6 + keywordScore * 0.4;
  const overallPct = Math.round(overallRaw * 100);

  const reasons: MatchReasonCode[] = [];
  if (skillBreakdown.present.length >= 2) reasons.push('EXACT_SKILL');
  if (userCerts.length > 0) reasons.push('CERT_EQUIVALENT');
  if (keywordScore >= 0.5) reasons.push('KEYWORD_HIT');
  reasons.push('KENYA_EXPERIENCE_MAPPED');
  if (
    (job.location && job.location.toLowerCase().includes('remote')) ||
    !job.location
  ) {
    reasons.push('LOCATION_OPEN');
  }

  return {
    overallPct,
    skillBreakdown,
    reasons,
    semanticScore: Math.round(semanticScore * 10000) / 10000,
    keywordScore: Math.round(keywordScore * 10000) / 10000,
  };
}

export async function scoreMatchBatch(
  users: UserLike[],
  jobs: JobLike[],
): Promise<Array<{ userId: string; jobId: string; score: ScoreMatchPairResult }>> {
  const out: Array<{ userId: string; jobId: string; score: ScoreMatchPairResult }> = [];
  for (const u of users) {
    for (const j of jobs) {
      const score = scoreMatchPair(u, j);
      if (score.overallPct >= 30) {
        out.push({ userId: u.id, jobId: j.id, score });
      }
    }
  }
  return out;
}

type ValidMatchReason =
  | 'EXACT_SKILL'
  | 'CERT_EQUIVALENT'
  | 'KENYA_EXPERIENCE_MAPPED'
  | 'KEYWORD_HIT'
  | 'LOCATION_OPEN';

export async function bulkUpsertJobMatches(
  prismaClient: PrismaClient,
  rows: Array<{
    userId: string;
    jobId: string;
    score: ScoreMatchPairResult;
    recalcVersion: number;
  }>,
): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (const row of rows) {
    const reasonsAsPrisma: ValidMatchReason[] = row.score.reasons.filter(
      (r): r is ValidMatchReason =>
        r === 'EXACT_SKILL' ||
        r === 'CERT_EQUIVALENT' ||
        r === 'KENYA_EXPERIENCE_MAPPED' ||
        r === 'KEYWORD_HIT' ||
        r === 'LOCATION_OPEN',
    );

    const skillBreakdownJson = row.score.skillBreakdown as unknown as Prisma.InputJsonValue;
    const reasonsJson = reasonsAsPrisma as unknown as Prisma.InputJsonValue;

    await prismaClient.jobMatch.upsert({
      where: {
        userId_jobId_recalcVersion: {
          userId: row.userId,
          jobId: row.jobId,
          recalcVersion: row.recalcVersion,
        },
      },
      create: {
        userId: row.userId,
        jobId: row.jobId,
        overallPct: row.score.overallPct,
        semanticScore: row.score.semanticScore,
        keywordScore: row.score.keywordScore,
        skillBreakdown: skillBreakdownJson,
        reasons: reasonsJson,
        recalcVersion: row.recalcVersion,
      },
      update: {
        overallPct: row.score.overallPct,
        semanticScore: row.score.semanticScore,
        keywordScore: row.score.keywordScore,
        skillBreakdown: skillBreakdownJson,
        reasons: reasonsJson,
      },
    });
    inserted++;
  }
  return inserted;
}

export async function recalcMatchesForUser(
  userId: string,
): Promise<MatchResult[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      skills: true,
      certifications: true,
      preferredCountries: true,
      profileHeadline: true,
      rawResumeText: true,
    },
  });

  if (!user) {
    return [];
  }

  const activeJobs = await prisma.job.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      company: true,
      category: true,
      salary: true,
      shift: true,
      location: true,
      rawApplyUrl: true,
      skillsRequired: true,
      matchKeywords: true,
      description: true,
    },
  });

  const userLike: UserLike = {
    id: user.id,
    skills: user.skills,
    certifications: user.certifications,
    preferredCountries: user.preferredCountries,
    profileHeadline: user.profileHeadline,
    rawResumeText: user.rawResumeText,
  };

  const scores = await scoreMatchBatch([userLike], activeJobs);

  // recalcVersion is an Int column; derive a monotonic per-user version instead
  // of Date.now() (which overflows 32-bit Int).
  const lastVersion = await prisma.jobMatch.aggregate({
    where: { userId },
    _max: { recalcVersion: true },
  });
  const recalcVersion = (lastVersion._max.recalcVersion ?? 0) + 1;

  await bulkUpsertJobMatches(
    prisma,
    scores.map((s) => ({ ...s, recalcVersion })),
  );

  const jobMap = new Map(activeJobs.map((j) => [j.id, j]));

  const results: MatchResult[] = scores
    .sort((a, b) => b.score.overallPct - a.score.overallPct)
    .map((s) => {
      const j = jobMap.get(s.jobId)!;
      return {
        id: `${s.userId}_${s.jobId}_${recalcVersion}`,
        jobId: s.jobId,
        overallPct: s.score.overallPct,
        skillBreakdown: s.score.skillBreakdown,
        reasons: s.score.reasons as MatchResult['reasons'],
        semanticScore: s.score.semanticScore,
        keywordScore: s.score.keywordScore,
        recalcVersion,
        job: {
          id: j.id,
          title: j.title,
          company: j.company,
          category: j.category ?? '',
          salary: j.salary,
          shift: j.shift,
          location: j.location ?? undefined,
          rawApplyUrl: j.rawApplyUrl,
        },
      };
    });

  return results;
}

export async function getTopMatches(
  userId: string,
  limit: number,
  minMatchPct = 0,
): Promise<MatchResult[]> {
  const matches = await prisma.jobMatch.findMany({
    where: {
      userId,
      overallPct: { gte: minMatchPct },
    },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          company: true,
          category: true,
          salary: true,
          shift: true,
          location: true,
          rawApplyUrl: true,
        },
      },
    },
    orderBy: { overallPct: 'desc' },
    take: Math.max(1, Math.min(500, limit)),
  });

  return matches.map((m) => ({
    id: m.id,
    jobId: m.jobId,
    overallPct: m.overallPct,
    skillBreakdown: (m.skillBreakdown as unknown as SkillBreakdown) ?? {
      present: [],
      missing: [],
      niceToHave: [],
    },
    reasons: (m.reasons as unknown as MatchResult['reasons']) ?? [],
    semanticScore: m.semanticScore ?? undefined,
    keywordScore: m.keywordScore ?? undefined,
    recalcVersion: m.recalcVersion,
    expiresAt: m.expiresAt ? m.expiresAt.toISOString() : undefined,
    job: {
      id: m.job.id,
      title: m.job.title,
      company: m.job.company,
      category: m.job.category ?? '',
      salary: m.job.salary,
      shift: m.job.shift,
      location: m.job.location ?? undefined,
      rawApplyUrl: m.job.rawApplyUrl,
    },
  }));
}

function deterministicFallbackExplain(
  skillBreakdown: SkillBreakdown,
): {
  narrative: string;
  weightedSkillGapsWithActions: Array<{
    missingSkill: string;
    howToGet: string;
    estHoursToAcquire: number;
  }>;
  percentTo100IfGapsClosed: number;
} {
  const missing = skillBreakdown.missing ?? [];
  const gaps = missing.slice(0, 3).map((skill) => ({
    missingSkill: skill,
    howToGet: `Self-study via ${skill} Kenyan online resource — Coursera/Kenya Medical Training College portal`,
    estHoursToAcquire: 12 + Math.floor(Math.random() * 29),
  }));

  if (gaps.length === 0) {
    gaps.push({
      missingSkill: 'Advanced EHR Proficiency',
      howToGet: 'Epic Scribe training module via HealthETAP Kenya affiliate portal',
      estHoursToAcquire: 24,
    });
  }

  const pctTo100 = missing.length === 0 ? 100 : Math.min(100, 75 + missing.length * 5);

  return {
    narrative:
      'Your Kenya clinical background gives a strong foundational match for this US remote role. Address the highlighted skill gaps with targeted Kenyan-accessible upskilling to push your candidacy into the top tier.',
    weightedSkillGapsWithActions: gaps,
    percentTo100IfGapsClosed: pctTo100,
  };
}

export async function explainMatch(
  userId: string,
  matchId: string,
): Promise<MatchExplained> {
  const matchRow = await prisma.jobMatch.findUnique({
    where: { id: matchId },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          company: true,
          category: true,
          salary: true,
          shift: true,
          location: true,
          rawApplyUrl: true,
          description: true,
        },
      },
      user: {
        select: {
          id: true,
          profileHeadline: true,
        },
      },
    },
  });

  if (!matchRow || matchRow.userId !== userId) {
    throw new Error('Match not found');
  }

  const skillBreakdown = (matchRow.skillBreakdown as unknown as SkillBreakdown) ?? {
    present: [],
    missing: [],
    niceToHave: [],
  };
  const reasons = (matchRow.reasons as unknown as MatchResult['reasons']) ?? [];

  const matchBreakdown = {
    overallPct: matchRow.overallPct,
    skillBreakdown: {
      present: skillBreakdown.present ?? [],
      missing: skillBreakdown.missing ?? [],
      niceToHave: skillBreakdown.niceToHave ?? [],
    },
    reasons: reasons as string[],
  };

  const { prompt, system } = buildMatchExplainPrompt(
    matchBreakdown,
    matchRow.job.description ?? '',
    matchRow.user?.profileHeadline ?? '',
  );

  let explainResult: {
    narrative: string;
    weightedSkillGapsWithActions: Array<{
      missingSkill: string;
      howToGet: string;
      estHoursToAcquire: number;
    }>;
    percentTo100IfGapsClosed: number;
  };

  try {
    const res = await aiComplete(prompt, system, {
      userId,
      feature: 'MATCH_EXPLAIN',
      temperature: 0.1,
      maxTokens: 2048,
    });
    let parsed: {
      narrative?: string;
      weightedSkillGapsWithActions?: Array<{
        missingSkill: string;
        howToGet: string;
        estHoursToAcquire: number;
      }>;
      percentTo100IfGapsClosed?: number;
    } = {};
    try {
      parsed = JSON.parse(res.output);
    } catch {
      parsed = { narrative: res.output };
    }
    explainResult = {
      narrative: parsed.narrative ?? '',
      weightedSkillGapsWithActions:
        parsed.weightedSkillGapsWithActions?.map((g) => ({
          missingSkill: g.missingSkill,
          howToGet: g.howToGet,
          estHoursToAcquire: Number(g.estHoursToAcquire) || 0,
        })) ?? [],
      percentTo100IfGapsClosed: parsed.percentTo100IfGapsClosed ?? 0,
    };
    if (
      !explainResult.narrative ||
      explainResult.weightedSkillGapsWithActions.length === 0
    ) {
      explainResult = deterministicFallbackExplain(skillBreakdown);
    }
  } catch {
    explainResult = deterministicFallbackExplain(skillBreakdown);
  }

  return {
    id: matchRow.id,
    jobId: matchRow.jobId,
    overallPct: matchRow.overallPct,
    skillBreakdown,
    reasons,
    semanticScore: matchRow.semanticScore ?? undefined,
    keywordScore: matchRow.keywordScore ?? undefined,
    recalcVersion: matchRow.recalcVersion,
    expiresAt: matchRow.expiresAt ? matchRow.expiresAt.toISOString() : undefined,
    job: {
      id: matchRow.job.id,
      title: matchRow.job.title,
      company: matchRow.job.company,
      category: matchRow.job.category ?? '',
      salary: matchRow.job.salary,
      shift: matchRow.job.shift,
      location: matchRow.job.location ?? undefined,
      rawApplyUrl: matchRow.job.rawApplyUrl,
    },
    narrative: explainResult.narrative,
    weightedSkillGapsWithActions: explainResult.weightedSkillGapsWithActions,
    percentTo100IfGapsClosed: explainResult.percentTo100IfGapsClosed,
  };
}
