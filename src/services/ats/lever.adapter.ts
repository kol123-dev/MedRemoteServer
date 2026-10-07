import axios from 'axios';
import { AtsAdapter, AtsContext, AtsJobInput, AtsSourceLike } from './ats.types';
import {
  DEFAULT_CATEGORY,
  DEFAULT_QUALIFICATION,
  DEFAULT_SALARY,
  DEFAULT_SHIFT,
  htmlToText,
  isTargetMedicalRole,
} from './shared';

/**
 * Lever v0 Postings API adapter.
 *
 * Docs: https://github.com/lever-co/lever-api
 * List all postings for a company (with full text content): GET
 *   https://api.lever.co/v0/postings/{company}?mode=json
 *
 * `{company}` (aka `token` on the AtsSource row) is the Lever company slug,
 * e.g. "binance", "enablecomp". Add rows day by day in the DB — no code changes.
 */
interface LeverCategories {
  commitment?: string | null;
  location?: string | null;
  team?: string | null;
  allLocations?: string[] | null;
  salaryRange?: unknown;
}

interface LeverListSection {
  text?: string;
  content?: string | null;
}

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: LeverCategories;
  createdAt?: number; // ms epoch
  workplaceType?: string | null;
  country?: string | null;
  descriptionPlain?: string | null;
  openingPlain?: string | null;
  descriptionBodyPlain?: string | null;
  additionalPlain?: string | null;
  lists?: LeverListSection[];
}

/** Serialize Lever's salaryRange (string | string[] | object) into a display string. */
function stringifySalary(raw?: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.filter(Boolean).join(' - ');
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const min = o.min ?? o.minimum ?? o.low;
    const max = o.max ?? o.maximum ?? o.high;
    if (min && max) return `${min} - ${max}`;
    return Object.values(o).filter(Boolean).join(' - ');
  }
  return String(raw);
}

/** Pick the best location label from Lever's location fields. */
function extractLocation(categories?: LeverCategories): string | undefined {
  if (categories?.allLocations?.length) {
    return categories.allLocations.join(' • ') || undefined;
  }
  return categories?.location || undefined;
}

/** Build a shift label from Lever's workplace type + commitment. */
function extractShift(categories: LeverCategories | undefined, workplaceType?: string | null): string {
  const parts: string[] = [];
  if (workplaceType) parts.push(workplaceType === 'remote' ? 'Remote' : workplaceType);
  if (categories?.commitment) parts.push(categories.commitment);
  return parts.join(' · ') || DEFAULT_SHIFT;
}

/** Normalize a broad team/category label into a MedRemote display category. */
function normalizeCategory(team?: string | null, title?: string): string {
  const hay = `${team ?? ''} ${title ?? ''}`.toLowerCase();
  if (/(cod|bill|revenu|claim|denial|rcm|reimbursement)/.test(hay)) return 'Medical Billing & Coding';
  if (/(nurse|clinical|telehealth|triage|care)/.test(hay)) return 'Clinical';
  if (/(support|success|customer)/.test(hay)) return 'Client Support';
  if (/(intake|schedul|coordinator|assistant|admin)/.test(hay)) return 'Virtual Assistant';
  return DEFAULT_CATEGORY;
}

/** Split a Lever `lists[]` into { responsibilities?, requirements? } by heading. */
function extractLists(lists: LeverListSection[] | undefined): {
  responsibilities?: string;
  requirements?: string;
} {
  const out: { responsibilities?: string; requirements?: string } = {};
  for (const section of lists ?? []) {
    const heading = (section.text ?? '').toLowerCase();
    const body = htmlToText(section.content);
    if (!body) continue;
    if (/responsib|duties|what you.ll do|what you will do/.test(heading)) {
      out.responsibilities = body;
    } else if (/requirement|qualification|experience|skills|what we look for/.test(heading)) {
      out.requirements = body;
    }
  }
  return out;
}

export class LeverAdapter implements AtsAdapter {
  readonly atsType = 'lever';

  private collectionUrl(token: string): string {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
  }

  async fetchJobs(source: AtsSourceLike, ctx: AtsContext): Promise<AtsJobInput[]> {
    const token = source.token.trim();
    if (!token) {
      ctx?.warn?.(`lever source "${source.name}" has an empty token; skipped.`);
      return [];
    }

    const url = this.collectionUrl(token);
    const res = await axios.get<LeverPosting[]>(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 MedRemoteBot/1.0' },
      timeout: 20000,
      validateStatus: s => s < 400,
    });

    const postings = Array.isArray(res.data) ? res.data : [];
    const out: AtsJobInput[] = [];

    for (const p of postings) {
      const title = p.text?.trim() ?? '';
      // Lever exposes both a hosted posting URL and a direct apply URL; prefer apply.
      const rawApplyUrl = p.applyUrl?.trim() || p.hostedUrl?.trim() || '';
      if (!title || !rawApplyUrl) continue;
      if (!isTargetMedicalRole(title)) continue;

      const salary = stringifySalary(p.categories?.salaryRange) || DEFAULT_SALARY;
      // Full text summary: prefer the plain opening, else the description body.
      const description =
        p.openingPlain?.trim() ||
        p.descriptionBodyPlain?.trim() ||
        [p.descriptionPlain, p.additionalPlain].filter(Boolean).join('\n\n').trim();

      const { responsibilities, requirements } = extractLists(p.lists);

      out.push({
        title,
        company: source.name, // Lever postings carry no per-job company field.
        salary,
        shift: extractShift(p.categories, p.workplaceType),
        qualification: DEFAULT_QUALIFICATION,
        rawApplyUrl,
        category: normalizeCategory(p.categories?.team, title),
        sourceAgency: source.name,
        description: description || undefined,
        requirements,
        responsibilities,
        location: extractLocation(p.categories),
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      });
    }

    ctx?.log?.(`[ats:lever] "${source.name}" (${token}) → ${out.length} jobs.`);
    return out;
  }
}