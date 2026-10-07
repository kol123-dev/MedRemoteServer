import { PrismaClient, AtsSource } from '@prisma/client';
import { getAtsAdapter, listAtsAdapters } from './ats';
import { AtsJobInput } from './ats/ats.types';
import {
  flattenAtsKeywordsByCategory,
  extractSkillsFromText,
} from './ai/skills.service.js';

const prisma = new PrismaClient();

const log = (msg: string) => console.log(`[scraper] ${msg}`);
const warn = (msg: string) => console.warn(`[scraper] ! ${msg}`);

const MAX_MATCH_KEYWORDS = 30;
const MAX_REQUIRED_SKILLS = 20;

/**
 * Derive ATS matching signals (matchKeywords + skillsRequired) for a scraped
 * job. Adapters don't supply them, but the Smart Match engine needs them to
 * score candidates. We seed from the job's category keyword bank and surface
 * additional keywords present in the description/requirements text.
 */
export function buildMatchSignals(job: AtsJobInput): {
  matchKeywords: string[];
  skillsRequired: string[];
} {
  // Build the free-text haystack once; it powers both category disambiguation
  // and description-derived keyword extraction.
  const descriptionText = [
    job.title,
    job.description ?? '',
    job.requirements ?? '',
    job.responsibilities ?? '',
  ].join(' ');

  const cat = job.category;
  const bank = flattenAtsKeywordsByCategory(cat, descriptionText);
  const hard = bank.hard ?? [];
  const tools = bank.tools ?? [];
  const soft = bank.soft ?? [];
  const compliance = bank.compliance ?? [];

  const skillsRequired = Array.from(new Set([...hard, ...tools]))
    .slice(0, MAX_REQUIRED_SKILLS);

  const descKeywords = extractSkillsFromText(descriptionText).slice(
    0,
    MAX_MATCH_KEYWORDS,
  );

  // Prioritize description-derived keywords (tightly scoped to the actual job)
  // over the broad bank, so the bank can't crowd out genuine matches.
  const matchKeywords = Array.from(
    new Set([...descKeywords, ...hard, ...tools, ...soft, ...compliance]),
  ).slice(0, MAX_MATCH_KEYWORDS);

  return { matchKeywords, skillsRequired };
}

function jobUpsertData(job: AtsJobInput) {
  const { rawApplyUrl, ...rest } = job;
  void rawApplyUrl;
  const { matchKeywords, skillsRequired } = buildMatchSignals(job);
  return {
    title: rest.title,
    company: rest.company,
    salary: rest.salary,
    shift: rest.shift,
    qualification: rest.qualification,
    category: rest.category,
    sourceAgency: rest.sourceAgency,
    description: rest.description ?? null,
    requirements: rest.requirements ?? null,
    responsibilities: rest.responsibilities ?? null,
    location: rest.location ?? null,
    postedAt: rest.postedAt ? new Date(rest.postedAt) : null,
    matchKeywords,
    skillsRequired,
  };
}

/**
 * Persist normalized jobs idempotently. `rawApplyUrl` is the unique key, so
 * re-running never duplicates; matching rows are refreshed and re-activated.
 */
async function upsertJobs(jobs: AtsJobInput[]): Promise<number> {
  let count = 0;
  for (const job of jobs) {
    await prisma.job.upsert({
      where: { rawApplyUrl: job.rawApplyUrl },
      update: { ...jobUpsertData(job), isActive: true },
      create: { ...jobUpsertData(job), rawApplyUrl: job.rawApplyUrl },
    });
    count++;
  }
  return count;
}

/** Result shape returned per source by syncSource / runScraperSuite. */
export interface SourceSyncResult {
  source: string;
  atsType: string;
  fetched: number;
  synced: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Fetch + persist jobs for a single AtsSource through its adapter.
 * Never throws; returns a per-source summary.
 */
export async function syncSource(source: AtsSource): Promise<SourceSyncResult> {
  const adapter = getAtsAdapter(source.atsType);
  if (!adapter) {
    const msg = `No adapter registered for atsType="${source.atsType}" (source "${source.name}").`;
    warn(msg);
    return { source: source.name, atsType: source.atsType, fetched: 0, synced: 0, skipped: true, error: msg };
  }

  try {
    const ctx = { log: (m: string) => log(m), warn: (m: string) => warn(m) };
    const jobs = await adapter.fetchJobs(source, ctx);
    const synced = await upsertJobs(jobs);
    log(`"${source.name}" [${source.atsType}/${source.token}] fetched=${jobs.length} synced=${synced}`);
    return { source: source.name, atsType: source.atsType, fetched: jobs.length, synced };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`Failed sync for "${source.name}" [${source.atsType}]: ${msg}`);
    return { source: source.name, atsType: source.atsType, fetched: 0, synced: 0, skipped: true, error: msg };
  }
}

/**
 * Main ingestion entrypoint. Reads every active AtsSource row from the DB,
 * routes each through the matching ATS adapter (registry) and upserts results.
 * Add/remove ATS board tokens in the DB — no code changes required.
 */
export async function runScraperSuite(): Promise<SourceSyncResult[]> {
  log('Reading active ATS sources...');
  const sources = await prisma.atsSource.findMany({ where: { isActive: true } });
  log(`Found ${sources.length} active source(s). Registered adapters: ${listAtsAdapters().join(', ')}`);

  const summary: SourceSyncResult[] = [];
  for (const source of sources) {
    summary.push(await syncSource(source));
  }
  return summary;
}