import axios from 'axios';
import { AtsAdapter, AtsContext, AtsJobInput, AtsSourceLike } from './ats.types';
import { DEFAULT_QUALIFICATION, DEFAULT_SALARY, DEFAULT_SHIFT, htmlToText, isTargetMedicalRole } from './shared';

/**
 * Working Nomads jobs API adapter (aggregate remote-jobs board).
 *
 * Exposed jobs API (JSON array):
 *   GET https://www.workingnomads.com/api/exposed_jobs/?page={n}
 *
 * `token` on the AtsSource row is informational (the board has no company
 * subdivision) and is only used for the source label. Add one row per board.
 */

const MAX_PAGES = 5;

interface WorkingNomadJob {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
}

/** Derive a display category from the board's own category + title. */
function deriveCategory(job: WorkingNomadJob): string {
  const cat = (job.category_name ?? '').toLowerCase();
  const hay = `${cat} ${job.title ?? ''}`.toLowerCase();
  if (/(cod|bill|revenu|claim|denial|rcm|reimbursement|accounting|finance)/.test(hay)) return 'Medical Billing & Coding';
  if (/(nurse|clinical|telehealth|triage|care|patient|health|physician|doctor|medical)/.test(hay)) return 'Clinical';
  if (/(support|success|service|customer|administration)/.test(hay)) return 'Client Support';
  if (/(writing|editor|content)/.test(hay)) return 'Content & Writing';
  return 'Medical Virtual Assistant';
}

export class WorkingNomadsAdapter implements AtsAdapter {
  readonly atsType = 'workingnomads';

  private collectionUrl(token: string, page: number): string {
    void token;
    return `https://www.workingnomads.com/api/exposed_jobs/?page=${page}`;
  }

  async fetchJobs(source: AtsSourceLike, ctx: AtsContext): Promise<AtsJobInput[]> {
    const out = new Map<string, AtsJobInput>();
    let emptyPages = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = this.collectionUrl(source.token, page);
      let jobs: WorkingNomadJob[] = [];
      try {
        const res = await axios.get<WorkingNomadJob[]>(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 MedRemoteBot/1.0' },
          timeout: 20000,
          validateStatus: s => s < 400,
        });
        jobs = Array.isArray(res.data) ? res.data : [];
      } catch (e) {
        ctx?.warn?.(`[ats:workingnomads] page ${page} failed: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }

      if (jobs.length === 0) {
        emptyPages++;
        if (emptyPages >= 2) break;
        continue;
      }
      // We got data — resume the countdown on subsequent pages.
      emptyPages = 0;

      for (const job of jobs) {
        const title = job.title?.trim() ?? '';
        const rawApplyUrl = job.url?.trim() ?? '';
        if (!title || !rawApplyUrl) continue;
        if (!isTargetMedicalRole(title)) continue;

        out.set(rawApplyUrl, {
          title,
          company: job.company_name?.trim() || source.name,
          salary: DEFAULT_SALARY,
          shift: DEFAULT_SHIFT,
          qualification: DEFAULT_QUALIFICATION,
          rawApplyUrl,
          category: deriveCategory(job),
          sourceAgency: source.name,
          description: htmlToText(job.description),
          requirements: undefined,
          responsibilities: undefined,
          location: job.location?.trim() || undefined,
          postedAt: job.pub_date ? new Date(job.pub_date).toISOString() : null,
        });
      }
    }

    const result = [...out.values()];
    ctx?.log?.(`[ats:workingnomads] "${source.name}" scanned=${MAX_PAGES} kept=${result.length}`);
    return result;
  }
}