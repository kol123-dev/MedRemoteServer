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
 * Greenhouse Boards API adapter.
 *
 * Docs: https://developers.greenhouse.io/job-board.html
 * List all jobs (optionally with full descriptions): GET
 *   https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 *
 * `{board_token}` (aka `token` on the AtsSource row) is things like "anthropic",
 * "cloudflare", "github", etc. Add rows day by day in the DB — no code changes.
 */

interface GreenhouseLocation {
  name?: string;
}
interface GreenhouseMetadata {
  name?: string;
  value?: string;
}
interface GreenhouseJob {
  id: number;
  title?: string;
  company_name?: string;
  absolute_url?: string;
  location?: GreenhouseLocation;
  updated_at?: string;
  content?: string;
  metadata?: GreenhouseMetadata[];
}

function extractSalary(job: GreenhouseJob, fallback: string): string {
  const line = job.metadata?.find(m =>
    /salary|comp|hourly|annual|rate/i.test(m.name ?? ''),
  )?.value;
  return line || fallback;
}

export class GreenhouseAdapter implements AtsAdapter {
  readonly atsType = 'greenhouse';

  private collectionUrl(token: string): string {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
  }

  async fetchJobs(source: AtsSourceLike, ctx: AtsContext): Promise<AtsJobInput[]> {
    const token = source.token.trim();
    if (!token) {
      ctx?.warn?.(`greenhouse source "${source.name}" has an empty token; skipped.`);
      return [];
    }

    const url = this.collectionUrl(token);
    const res = await axios.get<{ jobs?: GreenhouseJob[] }>(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 MedRemoteBot/1.0' },
      timeout: 20000,
      validateStatus: s => s < 400,
    });

    const jobs = res.data?.jobs ?? [];
    const out: AtsJobInput[] = [];

    for (const job of jobs) {
      const title = job.title?.trim() ?? '';
      const rawApplyUrl = job.absolute_url?.trim() ?? '';
      if (!title || !rawApplyUrl) continue;
      // Keep only medical roles — skip the rest silently.
      if (!isTargetMedicalRole(title)) continue;

      out.push({
        title,
        company: job.company_name?.trim() || source.name,
        salary: extractSalary(job, DEFAULT_SALARY),
        shift: DEFAULT_SHIFT,
        qualification: DEFAULT_QUALIFICATION,
        rawApplyUrl,
        category: DEFAULT_CATEGORY,
        sourceAgency: source.name,
        description: htmlToText(job.content),
        location: job.location?.name?.trim(),
        postedAt: job.updated_at ? new Date(job.updated_at).toISOString() : null,
      });
    }

    ctx?.log?.(`[ats:greenhouse] "${source.name}" (${token}) → ${out.length} jobs.`);
    return out;
  }
}