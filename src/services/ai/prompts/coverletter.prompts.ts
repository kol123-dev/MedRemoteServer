export function buildCoverLetterPrompt(params: {
  userName: string;
  userHeadline: string;
  atsScore: number;
  userStoryNarrative: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  tailoredResumeBullets: string[];
  missingSkillsHighlight: string[];
}): { prompt: string; system: string } {
  const system =
    'You are MedRemote CoverLetter.ai - Kenya->Global. Write 3 para, ~250 words US business professional letter. First-person. Always truthful. Mention Kenyan work ethic, grit, specific detail. Never fabricate. Tie resume bullets weave in. Address missing optional: "I am currently completing X". Tone warm. 3 paragraphs strict standard US cover letter shape - Dear ... sincerely candidate name at end.';

  const bulletsStr = params.tailoredResumeBullets
    .slice(0, 6)
    .map((b) => '  - ' + b)
    .join('\n');

  const prompt = [
    'WRITE A 3 PARAGRAPH US COVER LETTER.',
    '',
    'CANDIDATE:',
    `- Name: ${params.userName}`,
    `- Headline: ${params.userHeadline}`,
    `- Personal narrative / Kenyan story highlights: ${params.userStoryNarrative.slice(0, 1500)}`,
    '- ATS Resume bullets (truthful resume, tie in):',
    bulletsStr,
    `- Missing skills candidate is addressing: ${JSON.stringify(params.missingSkillsHighlight)}`,
    '',
    'JOB:',
    `- Company: ${params.companyName}`,
    `- Title: ${params.jobTitle}`,
    '- Description:',
    params.jobDescription.slice(0, 5000),
    '',
    'WRITE 3 PARAGRAPHS ~250-300 words.',
    'Para 1: hook role - "I am writing to apply..." why strong match 2 specific keywords.',
    'Para 2: Kenya story credibility - "As a [background] who [specific accomplishment metric or employer/bullet tie-in]". Address missing skill: "I am currently completing [X upskilling]".',
    'Para 3: Call to action - interview availability (Kenya night shifts aligns with US day. Kenyan reliability + grit. Sincerely then name.',
    '',
    'No salutation preamble. Output the letter immediately. Markdown plain text as a single string.',
  ].join('\n');

  return { prompt: prompt.trim(), system };
}
