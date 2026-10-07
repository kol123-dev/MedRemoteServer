import axios from 'axios';
import { AtsAdapter, AtsContext, AtsJobInput, AtsSourceLike } from './ats.types';
import {
  DEFAULT_CATEGORY,
  DEFAULT_QUALIFICATION,
  DEFAULT_SALARY,
  DEFAULT_SHIFT,
  isTargetMedicalRole,
} from './shared';

/**
 * Jobgether public jobs API adapter (aggregate remote-jobs board).
 *
 * Docs: https://jobgether.com/astroapi/ai/jobs/docs
 * List jobs (paginated): GET
 *   https://jobgether.com/api/v1/jobs?page={n}
 *
 * `token` on the AtsSource row is informational (the board has no company
 * subdivision) and is only used for the source label. Add one row per board.
 */

// Bound the number of pages we scan so a scrape doesn't run away.
const MAX_PAGES = 5;

interface JobgetherPagination {
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

interface JobgetherJob {
  id?: string;
  title?: string;
  company?: string;
  url?: string;
  location?: string;
  remote?: string;
  contractType?: string;
  experience?: string;
  salaryRange?: string;
  jobFunctions?: string[];
  postedAt?: string;
}

interface JobgetherResponse {
  jobs?: JobgetherJob[];
  pagination?: JobgetherPagination;
}

/** Build a shift label from Jobgether's contract type + remote fields. */
function buildShift(job: JobgetherJob): string {
  const parts: string[] = [];
  if (job.remote) parts.push(job.remote);
  if (job.contractType) parts.push(job.contractType);
  return parts.join(' · ') || DEFAULT_SHIFT;
}

/** Normalize salaryRange like "180000-225000 USD" / "192000 USD" into a display string. */
function normalizeSalary(raw?: string): string {
  if (!raw) return DEFAULT_SALARY;
  const cleaned = raw.trim();
  if (/\/\s*(hr|hour|hourly|mo|month|monthly|yr|year|annual)/i.test(cleaned)) return cleaned;
  const m = cleaned.match(/^(\d+(?:[\d.,-]*\d+)?)\s*-\s*(\d+(?:[\d.,-]*\d+)?)\s*(.+)$/);
  if (m) {
    const fmt = (n?: string) => Number((n ?? '').replace(/[^\d]/g, '')).toLocaleString();
    return `$${fmt(m[1])} - $${fmt(m[2])} ${(m[3] ?? '').trim()}`;
  }
  const single = cleaned.match(/^(\d+(?:[\d.,-]*\d+)?)\s*(.+)$/);
  if (single) {
    return `$${Number((single[1] ?? '').replace(/[^\d]/g, '')).toLocaleString()} ${(single[2] ?? '').trim()}`;
  }
  return cleaned;
}

/** Derive a display category from job functions / title. */
function deriveCategory(job: JobgetherJob): string {
  const hay = [...(job.jobFunctions ?? []), job.title ?? '']
    .join(' ')
    .toLowerCase();
  if (/(cod|bill|revenu|claim|denial|rcm|reimbursement|auditor)/.test(hay)) return 'Medical Billing & Coding';
  if (/(nurse|clinical|telehealth|triage|care|patient|health|physician|doctor)/.test(hay)) return 'Clinical';
  if (/(support|success|service|customer)/.test(hay)) return 'Client Support';
  if (/(medical|scribe|assistant|coordinator|intake|schedul|admin)/.test(hay)) return 'Medical Virtual Assistant';
  return DEFAULT_CATEGORY;
}

export class JobgetherAdapter implements AtsAdapter {
  readonly atsType = 'jobgether';

  private collectionUrl(token: string, page: number): string {
    // token is informational; the board endpoint is global + paginated.
    void token;
    return `https://jobgether.com/api/v1/jobs?page=${page}`;
  }

  async fetchJobs(source: AtsSourceLike, ctx: AtsContext): Promise<AtsJobInput[]> {
    const out = new Map<string, AtsJobInput>();
    let hasMore = true;

    for (let page = 1; page <= MAX_PAGES && hasMore; page++) {
      const url = this.collectionUrl(source.token, page);
      let data: JobgetherResponse;
      try {
        const res = await axios.get<JobgetherResponse>(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 MedRemoteBot/1.0' },
          timeout: 20000,
          validateStatus: s => s < 400,
        });
        data = res.data ?? {};
      } catch (e) {
        ctx?.warn?.(`[ats:jobgether] page ${page} failed: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }

      // Respect the board's own pagination signal; stop if a page comes back empty.
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      hasMore = data.pagination?.hasMore !== false && jobs.length > 0;

      for (const job of jobs) {
        const title = job.title?.trim() ?? '';
        const rawApplyUrl = job.url?.trim() ?? '';
        if (!title || !rawApplyUrl) continue;
        if (!isTargetMedicalRole(title)) continue;

        out.set(rawApplyUrl, {
          title,
          company: job.company?.trim() || source.name,
          salary: normalizeSalary(job.salaryRange),
          shift: buildShift(job),
          qualification: DEFAULT_QUALIFICATION,
          rawApplyUrl,
          category: deriveCategory(job),
          sourceAgency: source.name,
          description: undefined,
          location: job.location?.trim() || undefined,
          postedAt: job.postedAt ? new Date(job.postedAt).toISOString() : null,
        });
      }
    }

    const result = [...out.values()];
    ctx?.log?.(`[ats:jobgether] "${source.name}" scanned=${MAX_PAGES} kept=${result.length}`);
    return result;
  }
}