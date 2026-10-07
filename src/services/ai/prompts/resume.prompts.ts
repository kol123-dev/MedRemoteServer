export function buildResumeAnalyzePrompt(
  rawResume: string,
  targetRole?: string,
): { prompt: string; system: string } {
  const system =
    'You are a Kenyan-to-Global HR ATS analyzer for MedRemote, a platform that helps Kenyan medical & HVAC candidates get US/UK/EU remote jobs. You ONLY output valid JSON. No markdown fences. STRICT KEYWORD DENSITY for ATS = keywords repeated 3-6x US wording, not Kenyan ("SOAP notes" not "clinical notes", "Epic EHR" not "Carepay").';

  const roleClause = targetRole
    ? `Target role for bonus weighting: ${targetRole} (prioritize keywords matching this role).`
    : 'Infer likely target role from the resume.';

  const prompt = [
    'Kenyan candidate raw CV / resume raw text below. Analyze for US ATS compatibility.',
    '',
    roleClause,
    '',
    'REQUIRED output JSON shape (no extra prose, no triple-backtick json fences, just raw valid JSON):',
    '{',
    '  "atsScore": 0-100 integer,',
    '  "atsBreakdown": [ {label, ok:bool, tip?} ],',
    '  "certificationsFound": [ {kenyanName, usMapped?, ukMapped?, euMapped?, yearObtained?} ],',
    '  "skillsFound": [string],',
    '  "missingKeywords": [string],',
    '  "narrativeSummary": "2 sentence US-recruiter friendly paragraph max 140 words, specific not vague."',
    '}',
    '',
    'Use the 34-entry Kenya->US qualification map to detect cert equivalents.',
    'Prioritize keyword finds with 4+ keyword hits per category.',
    '',
    'RAW RESUME TEXT:',
    rawResume.slice(0, 15000),
  ].join('\n');

  return { prompt: prompt.trim(), system };
}

export function buildResumeRewritePrompt(params: {
  kenyaQualsMapRawHints: string;
  atsKeywordsByCategory: Record<
    string,
    { hard: string[]; compliance: string[]; tools: string[]; soft: string[] }
  >;
  actionVerbsList: string[];
  rawResume: string;
  targetJobDesc?: string;
}): { prompt: string; system: string } {
  const system =
    'You are an elite US healthcare/HVAC ATS resume writer for MedRemote Kenya->Global program. Write a ONE-PAGE US FORMAT resume in GFM Markdown. STRICT: no lies, no fabrication of dates/employers/certs. REWRITE existing true facts only into US wording, US action verbs, dense but truthful Kenyan cert mapped to US acronyms. 3-6 keyword density. Output STRICT Markdown starting "# Name - Role Target, not CV, Professional Summary section, then Core Competencies (bulleted), then Professional Experience (each entry: role first, then bullets with verbs first), then Certifications & Education (with US maps in parens), then Technical & Soft Skills (ATS keyword dense)."';

  const targetClause = params.targetJobDesc
    ? [
        '',
        'TARGET JOB DESCRIPTION (tailor every bullet for this role keyword density 4-6x where truthful match, no fabrication):',
        params.targetJobDesc.slice(0, 6000),
        '',
      ].join('\n')
    : 'No specific target role - optimize for the candidate strongest mapped field (scribe / billing / reception / HVAC most applicable).';

  const prompt = [
    'REWRITE this Kenyan CV into a US ATS-optimized resume in GFM Markdown. Tell the TRUTH - NEVER fabricate.',
    '',
    'KENYA QUAL MAP HINTS (detect + map to US equivalents, DO NOT INVENT):',
    params.kenyaQualsMapRawHints.slice(0, 4000),
    '',
    'ATS KEYWORDS BY CATEGORY (sprinkle truthful hits organically 3-6x):',
    JSON.stringify(params.atsKeywordsByCategory, null, 2).slice(0, 5000),
    '',
    'ACTION VERBS (start EVERY experience bullet with THESE VERBS conjugated):',
    params.actionVerbsList.slice(0, 80).join(', '),
    '',
    targetClause,
    '',
    'CANDIDATE RAW CV (SOURCE OF TRUTH - rewrite/wording US format, DO NOT FABRICATE NEW facts):',
    params.rawResume.slice(0, 12000),
    '',
    'OUTPUT STRICT GFM Markdown only - start immediately. No preamble.',
  ].join('\n');

  return { prompt: prompt.trim(), system };
}
