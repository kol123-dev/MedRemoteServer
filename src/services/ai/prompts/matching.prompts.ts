export function buildMatchScorePrompt(params: {
  userSkills: string[];
  userCerts: string[];
  jobSkills: string[];
  jobKeywords: string[];
  userLocationPrefs: string[];
  jobLocation: string;
}): { prompt: string; system: string } {
  const system =
    'You are MedRemote MatchEngine v2 - a Kenya->Global semantic match scorer. Output ONLY valid JSON.';

  const prompt = [
    'Compute semantic + keyword match between Kenyan candidate and global job.',
    '',
    'CANDIDATE PROFILE:',
    `- Skills (mapped): ${JSON.stringify(params.userSkills.slice(0, 60))}`,
    `- Certs (Kenyan + US maps): ${JSON.stringify(params.userCerts.slice(0, 30))}`,
    `- Location prefs (countries OK): ${JSON.stringify(params.userLocationPrefs)}`,
    '',
    'JOB POST:',
    `- Required skills: ${JSON.stringify(params.jobSkills.slice(0, 60))}`,
    `- ATS keywords: ${JSON.stringify(params.jobKeywords.slice(0, 60))}`,
    `- Location: ${params.jobLocation || 'Remote / Any'}`,
    '',
    'OUTPUT STRICT JSON, shape:',
    '{',
    '  "semanticScore": 0.0 - 1.0,',
    '  "keywordScore": 0.0 - 1.0,',
    '  "skillBreakdown": {',
    '    "present": [string],',
    '    "missing": [string],',
    '    "niceToHave": [string]',
    '  },',
    '  "reasons": ["EXACT_SKILL"|"CERT_EQUIVALENT"|"KENYA_EXPERIENCE_MAPPED"|"KEYWORD_HIT"|"LOCATION_OPEN"]',
    '}',
    '',
    'Jaccard present threshold > 0.3, nice 0.1-0.29.',
  ].join('\n');

  return { prompt: prompt.trim(), system };
}

export function buildMatchExplainPrompt(
  matchBreakdown: {
    overallPct: number;
    skillBreakdown: { present: string[]; missing: string[]; niceToHave?: string[] };
    reasons: string[];
  },
  jobDesc: string,
  userHeadline: string,
): { prompt: string; system: string } {
  const system =
    'You are MedRemote CareerCoach Kenya->Global. You explain a match gap to a Kenyan seeker. Output JSON only. Give specific Kenya-to-US upskilling paths. Be specific: course link-free names only (names only - SPECIFIC concrete upskilling pathways. Hours realistic).';

  const prompt = [
    'Given the below Match Result for THIS SEEKER + JOB, explain gap + concrete actions.',
    '',
    `SEEKER HEADLINE: ${userHeadline || '(none)'}`,
    '',
    'MATCH RESULT SNAPSHOT:',
    JSON.stringify(matchBreakdown, null, 2),
    '',
    'JOB DESCRIPTION:',
    jobDesc.slice(0, 4000),
    '',
    'OUTPUT VALID JSON:',
    '{',
    '  "narrative": "3-4 sentence paragraph: what is strong, why, up tone, Kenya->US coach wording.",',
    '  "weightedSkillGapsWithActions": [',
    '    {',
    '      "missingSkill": "string",',
    '      "howToGet": "Specific concrete program/cert/course name (realistic Kenya-accessible, free first then paid). 60 chars max.",',
    '      "estHoursToAcquire": number realistic',
    '    }',
    '  ],',
    '  "percentTo100IfGapsClosed": integer 0-100',
    '}',
    '',
    'Prioritize gaps by missing*impact. NO LINKS. NAME PROGRAMS ONLY by title.',
  ].join('\n');

  return { prompt: prompt.trim(), system };
}
