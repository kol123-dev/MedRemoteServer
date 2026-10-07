import { ATS_KEYWORDS_BANK, resolveKeywordBank } from '../../lib/atsKeywords.js';
import {
  kenyaQualLookup,
  type QualMapping,
} from '../../lib/kenyaQualsMap.js';

const SUFFIX_STRIP: ReadonlyArray<[RegExp, string]> = [
  [/ed$/, ''],
  [/ing$/, ''],
  [/ly$/, ''],
  [/s$/, ''],
  [/es$/, ''],
  [/ies$/, 'y'],
  [/tion$/, ''],
  [/sion$/, ''],
  [/ment$/, ''],
  [/ness$/, ''],
  [/ful$/, ''],
  [/less$/, ''],
  [/able$/, ''],
  [/ible$/, ''],
  [/ous$/, ''],
  [/ive$/, ''],
  [/al$/, ''],
  [/ic$/, ''],
];

function stemWord(wordIn: string): string {
  let w = wordIn.toLowerCase().trim();
  if (w.length <= 3) return w;
  for (const [re, rep] of SUFFIX_STRIP) {
    if (re.test(w)) {
      const next = w.replace(re, rep);
      if (next.length >= 3) {
        w = next;
        break;
      }
    }
  }
  return w;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#/&\- ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function nGrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

export function extractSkillsFromText(text: string): string[] {
  if (!text) return [];
  const tokens = tokenize(text);
  const uni = tokens;
  const bi = nGrams(tokens, 2);
  const tri = nGrams(tokens, 3);
  const four = nGrams(tokens, 4);
  const allNgrams = [...four, ...tri, ...bi, ...uni];

  const bankKeywords = new Map<string, { raw: string; bank: string }>();
  for (const bank of ATS_KEYWORDS_BANK) {
    const pool = [
      ...bank.hardSkills,
      ...bank.complianceLegal,
      ...bank.techToolsEhr,
      ...bank.softSkills,
    ];
    for (const kw of pool) {
      bankKeywords.set(kw.toLowerCase(), { raw: kw, bank: bank.category });
    }
  }

  const KNCK_TVET_HINTS = [
    'knck', 'krmn', 'krcn', 'kerm', 'krchn', 'krpn', 'kcse', 'knec', 'kmlttb',
    'kppb', 'tvet', 'nita', 'kasneb', 'cpa', 'cpb', 'kndi', 'clinical officer',
    'registered nurse', 'enrolled midwife', 'community health',
  ];

  const hitsMap = new Map<string, string>();

  for (const gram of allNgrams) {
    if (bankKeywords.has(gram)) {
      const entry = bankKeywords.get(gram)!;
      if (!hitsMap.has(entry.raw)) hitsMap.set(entry.raw, entry.raw);
    }
  }

  const lowerText = text.toLowerCase();
  for (const hint of KNCK_TVET_HINTS) {
    if (lowerText.includes(hint)) {
      const mapped = kenyaQualLookup(hint);
      if (mapped) {
        hitsMap.set(mapped.kenyanName, mapped.kenyanName);
        if (mapped.usMapped) hitsMap.set(mapped.usMapped, mapped.usMapped);
      } else {
        hitsMap.set(hint, hint);
      }
    }
  }

  const stemmedText = new Set(tokenize(text).map(stemWord));
  for (const [lowerKw, entry] of bankKeywords.entries()) {
    const kwTokens = tokenize(lowerKw);
    if (kwTokens.length === 0) continue;
    let allHit = true;
    for (const kt of kwTokens) {
      const s = stemWord(kt);
      const found =
        stemmedText.has(kt) ||
        stemmedText.has(s) ||
        [...stemmedText].some((st) => (st.length >= 4 && s.length >= 4 && (st.startsWith(s) || s.startsWith(st))));
      if (!found) {
        allHit = false;
        break;
      }
    }
    if (allHit && !hitsMap.has(entry.raw)) {
      hitsMap.set(entry.raw, entry.raw);
    }
  }

  return Array.from(hitsMap.values());
}

export function normalizeKenyaQualName(name: string): QualMapping | undefined {
  return kenyaQualLookup(name);
}

export function jaccard(aArr: string[], bArr: string[]): number {
  const a = new Set(aArr.map((s) => s.toLowerCase().trim()));
  const b = new Set(bArr.map((s) => s.toLowerCase().trim()));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

export function diffSkillSets(
  have: string[],
  need: string[],
): { present: string[]; missing: string[]; niceToHave: string[] } {
  const present: string[] = [];
  const niceToHave: string[] = [];
  const missing: string[] = [];

  for (const req of need) {
    let bestJac = 0;
    let bestHave = '';
    for (const h of have) {
      const j = jaccard([h], [req]);
      if (j > bestJac) {
        bestJac = j;
        bestHave = h;
      }
    }
    const tokens = [req.toLowerCase()];
    const stemmedHit = have.some((h) => {
      const hl = h.toLowerCase();
      return (
        tokens.some((t) => hl.includes(t) || t.includes(hl)) ||
        stemWord(h) === stemWord(req)
      );
    });

    if (bestJac > 0.3 || stemmedHit) {
      present.push(req);
    } else if (bestJac >= 0.1 && bestJac <= 0.29) {
      niceToHave.push(req);
    } else {
      missing.push(req);
    }
    void bestHave;
  }

  return { present, missing, niceToHave };
}

export function computeKeywordScore(
  userText: string,
  jobKeywords: string[],
): number {
  if (!jobKeywords || jobKeywords.length === 0) return 0.5;
  const extracted = new Set(extractSkillsFromText(userText).map((s) => s.toLowerCase()));
  const allUserTokens = new Set(tokenize(userText));
  let hits = 0;
  for (const kwRaw of jobKeywords) {
    const kw = kwRaw.toLowerCase();
    if (extracted.has(kw)) {
      hits++;
      continue;
    }
    const kwToks = tokenize(kw);
    if (kwToks.length > 0 && kwToks.every((t) => allUserTokens.has(t))) {
      hits++;
      continue;
    }
    const stemMatch = kwToks.every((kt) =>
      [...allUserTokens].some((ut) => {
        const a = stemWord(kt);
        const b = stemWord(ut);
        return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
      }),
    );
    if (stemMatch) hits++;
  }
  // Curated job keywords are high-precision requirements, so a small number of
  // genuine hits should count for a lot, then plateau once solidly matched.
  const effectiveDenom = Math.max(5, jobKeywords.length * 0.45);
  const raw = hits / effectiveDenom;
  const boosted = Math.min(1, raw * (hits > 0 ? 1.4 : 0));
  return Math.round(boosted * 10000) / 10000;
}

export function flattenAtsKeywordsByCategory(
  category?: string,
  text?: string,
): { hard: string[]; compliance: string[]; tools: string[]; soft: string[] } {
  const bank = resolveKeywordBank(category, text);
  return {
    hard: [...bank.hardSkills],
    compliance: [...bank.complianceLegal],
    tools: [...bank.techToolsEhr],
    soft: [...bank.softSkills],
  };
}
