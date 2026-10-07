import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { AtsAdapter, AtsContext, AtsJobInput, AtsSourceLike } from './ats.types';
import { DEFAULT_QUALIFICATION, DEFAULT_SALARY, DEFAULT_SHIFT, isTargetMedicalRole } from './shared';

/**
 * Remote.co HTML jobs adapter.
 *
 * Remote.co serves its job-board pages as server-rendered Next.js HTML, so we
 * fetch the page and parse the job cards with Cheerio (light, fast). The page
 * is heavy and bot-guarded, so a direct HTTP fetch (axios) often times out.
 * We therefore load the rendered HTML through Playwright's headless Chromium
 * (real browser, passes the platform's bot checks) and fall back to a plain
 * axios GET if Playwright is unavailable.
 *
 * Page URL: GET https://remote.co/remote-jobs/{category}?page={n}
 * `token` on the AtsSource row = the category path segment, e.g. "nursing",
 * "medical-coding", "healthcare", "dental". Add one row per category.
 */

const MAX_PAGES = 3;

// Browsers were installed to a repo-local `backend/.browsers` dir (the default
// `AppData\Local\ms-playwright` path is blocked by the dev sandbox). Resolve the
// Chromium executable directly and hand it to `chromium.launch()` below so we
// don't depend on Playwright's own cache-dir resolution (which races imports).
const BROWSERS_DIR = path.resolve(__dirname, '../../../.browsers');

/** Locate the Chromium/headless-shell executable under `.browsers` (version-tolerant). */
function findChromeExecutable(): string | undefined {
  let dirs: string[];
  try {
    dirs = fs.readdirSync(BROWSERS_DIR);
  } catch {
    return undefined;
  }
  for (const d of dirs) {
    if (!/^chromium(?:_headless_shell)?-\d+$/.test(d)) continue;
    const headless = path.join(
      BROWSERS_DIR, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe',
    );
    if (fs.existsSync(headless)) return headless;
    const chromium = path.join(BROWSERS_DIR, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(chromium)) return chromium;
  }
  return undefined;
}

// Relax the keyword gate for Remote.co: its categories are already curated
// (nursing, medical-coding, healthcare), so we accept any card under them but
// still drop clearly non-health roles like software/design.
export const REMOTECO_ROLE_KEYWORDS = [
  'scribe', 'billing', 'coder', 'coding', 'intake', 'telehealth', 'triage',
  'nurse', 'rn', 'np', 'lpn', 'lvn', 'clinical', 'medical', 'health', 'patient',
  'care', 'physician', 'doctor', 'radiology', 'pharmacy', 'therapist', 'counselor',
  'case manager', 'utilization', 'prior auth', 'hims', 'hipaa', 'revenue cycle',
  'virtual assistant', 'care coordinator', 'phlebotomy', 'sonographer', 'dental',
];

function isTargetRole(title: string): boolean {
  const t = title.toLowerCase();
  // Non-health blocklist first.
  const blocked = ['software engineer', 'developer', 'designer', 'data engineer',
    'devops', 'full-stack', 'product manager', 'marketing', 'sales', 'recruiter'];
  if (blocked.some(b => t.includes(b))) return false;
  if (REMOTECO_ROLE_KEYWORDS.some(kw => t.includes(kw))) return true;
  return isTargetMedicalRole(title);
}

/** Convert a RelativeTime span ("11 days ago", "3 hours ago") to an ISO date. */
function relativeToIso(rel?: string): string | null {
  if (!rel) return null;
  const m = rel.match(/^(\d+)\s*(day|days|hour|hours|week|weeks|month|months|year|years)?\s*ago$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || 'day').toLowerCase();
  const now = new Date();
  const unitMs = unit.startsWith('day') ? 86400000
    : unit.startsWith('hour') ? 3600000
    : unit.startsWith('week') ? 604800000
    : unit.startsWith('month') ? 2592000000
    : 31536000000;
  return new Date(now.getTime() - n * unitMs).toISOString();
}

export class RemoteCoAdapter implements AtsAdapter {
  readonly atsType = 'remoteco';

  private collectionUrl(token: string, page: number): string {
    return `https://remote.co/remote-jobs/${encodeURIComponent(token)}?page=${page}`;
  }

  /**
   * Load the fully-rendered HTML for a collection page.
   *
   * Tries Playwright headless Chromium first (a real browser walks past
   * Remote.co's bot checks and renders JS), falling back to a plain axios GET
   * when the browser isn't available or fails. Returns the HTML string.
   */
  private async _loadHTML(url: string): Promise<string> {
    try {
      return await this._loadWithPlaywright(url);
    } catch (pwErr) {
      // Fall back to a plain HTTP GET (cheap, no browser needed).
      try {
        const res = await axios.get<string>(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          timeout: 25000,
          validateStatus: s => s < 400,
        });
        return res.data;
      } catch {
        throw pwErr instanceof Error ? pwErr : new Error(String(pwErr));
      }
    }
  }

  private async _loadWithPlaywright(url: string): Promise<string> {
    // Use the repo-local Chromium binary directly (version-tolerant discovery).
    const executablePath = findChromeExecutable();
    if (!executablePath) {
      throw new Error('Playwright Chromium not found in backend/.browsers. Run: npx playwright install chromium');
    }
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      // --disable-http2 avoids intermittent ERR_HTTP2_PROTOCOL_ERROR on this host.
      args: ['--disable-http2', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    try {
      const page = await browser.newPage({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return await page.content();
    } finally {
      await browser.close();
    }
  }

  async fetchJobs(source: AtsSourceLike, ctx: AtsContext): Promise<AtsJobInput[]> {
    const token = source.token.trim().toLowerCase();
    if (!token) {
      ctx?.warn?.(`[ats:remoteco] source "${source.name}" has an empty category token; skipped.`);
      return [];
    }

    const out = new Map<string, AtsJobInput>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = this.collectionUrl(token, page);
      let html = '';
      try {
        html = await this._loadHTML(url);
      } catch (e) {
        // Remote.co occasionally rate-limits (403) or times out. Skip instead of crashing.
        ctx?.warn?.(`[ats:remoteco] "${source.name}" page ${page} failed: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }

      if (!html) break;
      const $ = cheerio.load(html);
      // Cards are server-rendered `<div role="link" data-index=...>` wrappers that
      // contain a job-details anchor + an <h3> title. Fall back to scanning any
      // job-details anchor if the role="link" wrapper is missing.
      const wrappers = $('[role="link"]').filter((_, el) => !!$(el).find('a[href*="/job-details/"]').length);
      const nodes = wrappers.length > 0 ? wrappers : $('a[href*="/job-details/"]');

      if (nodes.length === 0) {
        // No jobs on this page — stop (covers last page + empty categories).
        break;
      }

      for (const el of nodes) {
        const node = $(el);
        // When the wrapper is the job-card `[role="link"]`, the title lives in an
        // <h3> and the apply URL in an inner anchor. When we fell back to the
        // anchor itself, read title/URL directly from it.
        const isCard = wrappers.length > 0;
        const titleNode = isCard ? node.find('h3').first() : node;
        const title = titleNode.text().trim();
        if (!title) continue;

        const href = isCard
          ? (node.find('a[href*="/job-details/"]').first().attr('href') ?? '')
          : (node.attr('href') ?? '');
        const rawApplyUrl = href.startsWith('http') ? href : `https://remote.co${href}`;
        if (!rawApplyUrl.includes('/job-details/')) continue;
        if (!isTargetRole(title)) continue;

        // Tags: `<ul><li>` items hold remote/schedule/employment/salary info.
        const tags = node
          .find('ul li')
          .map((_, el2) => $(el2).text().replace(/\s+/g, ' ').trim())
          .get()
          .filter((t): t is string => Boolean(t));

        let salary = DEFAULT_SALARY;
        const salaryTag = tags.find((t) => /\$|hourly|hour|annual|salary|\b(aed|usd|gbp|ksh)\b/i.test(t));
        if (salaryTag && /\d/.test(salaryTag)) salary = salaryTag.split('Hours').join('hrs').trim();
        else if (salaryTag) salary = salaryTag.trim();

        const remote = tags.find((t) => /remote|100%/i.test(t)) ?? '100% Remote';
        const schedule = tags.find((t) => /full|part|contract|freelance|alternative|flexible|shift/i.test(t));
        const shift = schedule ? `${remote} · ${schedule}` : `${remote} · ${DEFAULT_SHIFT}`;

        // Location: the `<span>` that follows the location-dot icon within the card.
        const location = node
          .find('i.fa-location-dot')
          .parent()
          .find('span')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();

        const postedRel = node.find('a[href*="/job-details/"] span').first().text().trim();

        out.set(rawApplyUrl, {
          title,
          company: token, // Remote.co cards don't carry the company in this markup.
          salary,
          shift,
          qualification: DEFAULT_QUALIFICATION,
          rawApplyUrl,
          category: source.name,
          sourceAgency: source.name,
          description: undefined,
          requirements: undefined,
          responsibilities: undefined,
          location: location || undefined,
          postedAt: relativeToIso(postedRel),
        });
      }

      // Real pages always return a full set; stop after the configured cap.
    }

    const result = [...out.values()];
    ctx?.log?.(`[ats:remoteco] "${source.name}" (${token}) kept=${result.length}`);
    return result;
  }
}