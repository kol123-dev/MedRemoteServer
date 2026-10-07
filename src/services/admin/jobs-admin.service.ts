import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { writeAudit, AdminAction } from './audit.service.js';
import { runScraperSuite } from '../scraper.service.js';
import { syncSource } from '../scraper.service.js';
import { listAtsAdapters } from '../ats/index.js';

const prisma = new PrismaClient();

export interface AdminJobsQuery {
  search?: string;
  category?: string;
  sourceAgency?: string;
  active?: boolean;
  page: number;
  pageSize: number;
}

export interface AdminJobRow {
  id: string;
  title: string;
  company: string;
  category: string;
  sourceAgency: string;
  location?: string | null;
  salary: string;
  isActive: boolean;
  postedAt: Date | null;
  createdAt: Date;
  rawApplyUrl: string;
}

function toRow(row: {
  id: string;
  title: string;
  company: string;
  category: string;
  sourceAgency: string;
  location: string | null;
  salary: string;
  isActive: boolean;
  postedAt: Date | null;
  createdAt: Date;
  rawApplyUrl: string;
}): AdminJobRow {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    category: row.category,
    sourceAgency: row.sourceAgency,
    location: row.location,
    salary: row.salary,
    isActive: row.isActive,
    postedAt: row.postedAt,
    createdAt: row.createdAt,
    rawApplyUrl: row.rawApplyUrl,
  };
}

/** List + search jobs (including inactive) with pagination. */
export async function listJobs(
  req: Request,
  q: AdminJobsQuery,
): Promise<{ items: AdminJobRow[]; total: number; page: number; pageSize: number }> {
  const where: Record<string, unknown> = {};
  if (typeof q.active === 'boolean') {
    where.isActive = q.active;
  }
  if (q.category) where.category = q.category;
  if (q.sourceAgency) where.sourceAgency = q.sourceAgency;
  if (q.search) {
    where.OR = [
      { title: { contains: q.search } },
      { company: { contains: q.search } },
      { sourceAgency: { contains: q.search } },
      { category: { contains: q.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.job.findMany({
      where: where as never,
      orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        title: true,
        company: true,
        category: true,
        sourceAgency: true,
        location: true,
        salary: true,
        isActive: true,
        postedAt: true,
        createdAt: true,
        rawApplyUrl: true,
      },
    }),
    prisma.job.count({ where: where as never }),
  ]);

  return {
    items: items.map(toRow),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Fetch a single job's full record. Returns null if not found. */
export async function getJob(req: Request, id: string) {
  return prisma.job.findUnique({ where: { id } });
}

/** Toggle a job's active flag. Returns null if not found. */
export async function setJobActive(req: Request, id: string, active: boolean) {
  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.job.update({
    where: { id },
    data: { isActive: active },
  });
  void writeAudit({
    context: { actorUserId: (req.user as { sub?: string } | undefined)?.sub },
    action: active ? AdminAction.JOB_ACTIVATE : AdminAction.JOB_DEACTIVATE,
    targetType: 'job',
    targetId: id,
    meta: { title: existing.title },
  });
  return row;
}

/** Permanently delete a job row. Returns { id } or null. */
export async function deleteJob(req: Request, id: string) {
  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) return null;
  // Matches/applications/saved relations cascade per schema.
  await prisma.job.delete({ where: { id } });
  void writeAudit({
    context: { actorUserId: (req.user as { sub?: string } | undefined)?.sub },
    action: AdminAction.JOB_DELETE,
    targetType: 'job',
    targetId: id,
    meta: { title: existing.title },
  });
  return { id };
}

/** Distinct categories across all jobs (for filter dropdowns). */
export async function jobFacets() {
  const [categories, agencies] = await Promise.all([
    prisma.job.findMany({ distinct: ['category'], select: { category: true } }),
    prisma.job.findMany({ distinct: ['sourceAgency'], select: { sourceAgency: true } }),
  ]);
  return {
    categories: categories.map((c) => c.category),
    agencies: agencies.map((a) => a.sourceAgency),
  };
}

// ---------------- ATS scraping orchestration (audit-logged) ----------------

/** Run a single ATS source ("scrape now"). Returns summary or null if missing. */
export async function scrapeSourceById(req: Request, sourceId: string) {
  const source = await prisma.atsSource.findUnique({ where: { id: sourceId } });
  if (!source) return null;
  const result = await syncSource(source);
  void writeAudit({
    context: { actorUserId: (req.user as { sub?: string } | undefined)?.sub },
    action: AdminAction.ATS_SCRAPE_NOW,
    targetType: 'atsSource',
    targetId: sourceId,
    meta: { source: source.name, atsType: source.atsType },
  });
  return result;
}

/** Run all active ATS sources ("scrape all"). Returns per-source summaries. */
export async function scrapeAll(req: Request) {
  const summary = await runScraperSuite();
  void writeAudit({
    context: { actorUserId: (req.user as { sub?: string } | undefined)?.sub },
    action: AdminAction.ATS_SCRAPE_ALL,
    targetType: 'ats',
    meta: { count: summary.length },
  });
  return summary;
}

/** Adapter keys available in the registry (for the add-source form). */
export function adapterTypes(): string[] {
  return listAtsAdapters();
}

export default {
  listJobs,
  getJob,
  setJobActive,
  deleteJob,
  jobFacets,
  scrapeSourceById,
  scrapeAll,
  adapterTypes,
};