import type { Request, Response, NextFunction } from 'express';
import * as usersService from '../services/admin/users-admin.service.js';
import * as llmService from '../services/admin/llm-admin.service.js';
import * as configService from '../services/admin/config-admin.service.js';
import * as jobsService from '../services/admin/jobs-admin.service.js';
import * as atsSourceService from '../services/ats-source.service.js';
import { listAudit, contextFromRequest } from '../services/admin/audit.service.js';

// A tiny async handler wrapper that forwards caught errors to Express.
const wrap =
  (fn: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

// ---------------- Users ----------------
export const listUsers = wrap(async (req, res) => {
  const data = await usersService.listUsers(req, {
    search: req.query.search as string | undefined,
    role: req.query.role as never,
    tier: req.query.tier as never,
    active: req.query.active as boolean | undefined,
    page: Number(req.query.page ?? 1),
    pageSize: Number(req.query.pageSize ?? 20),
  });
  res.json(data);
});

export const getUser = wrap(async (req, res) => {
  const user = await usersService.getUserDetail(req, req.params.id as string);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

export const createUser = wrap(async (req, res) => {
  const b = req.body as {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    role: never;
  };
  const user = await usersService.createUser(req, {
    firstName: b.firstName,
    lastName: b.lastName,
    phoneNumber: b.phoneNumber,
    email: b.email,
    password: b.password,
    role: b.role,
  });
  res.status(201).json(user);
});

export const updateUser = wrap(async (req, res) => {
  const user = await usersService.updateUser(req, req.params.id as string, req.body);
  res.json(user);
});

export const patchUserActive = wrap(async (req, res) => {
  const user = await usersService.setUserActive(req, req.params.id as string, Boolean(req.body.active));
  res.json(user);
});

export const bulkUserActive = wrap(async (req, res) => {
  const { ids, active } = req.body as { ids: string[]; active: boolean };
  const count = await usersService.bulkSetActive(req, ids, active);
  res.json({ count });
});

export const userActivity = wrap(async (req, res) => {
  const data = await usersService.userActivity(req, req.params.id as string);
  res.json(data);
});

// ---------------- LLM providers ----------------
export const listLlmProviders = wrap(async (req, res) => {
  res.json(await llmService.listProviders(req));
});

export const getLlmProvider = wrap(async (req, res) => {
  const p = await llmService.getProvider(req, req.params.id as string);
  if (!p) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }
  res.json(p);
});

export const createLlmProvider = wrap(async (req, res) => {
  const provider = await llmService.createProvider(req, req.body);
  res.status(201).json(provider);
});

export const updateLlmProvider = wrap(async (req, res) => {
  const provider = await llmService.updateProvider(req, req.params.id as string, req.body);
  res.json(provider);
});

export const deleteLlmProvider = wrap(async (req, res) => {
  await llmService.removeProvider(req, req.params.id as string);
  res.status(204).end();
});

export const llmUsage = wrap(async (req, res) => {
  const data = await llmService.providerUsage(req, req.query.model as string | undefined, Number(req.query.days ?? 30));
  res.json(data);
});

// ---------------- System config ----------------
export const listConfig = wrap(async (req, res) => {
  res.json(await configService.listConfig(req));
});

export const getConfigKey = wrap(async (req, res) => {
  const c = await configService.getConfigKey(req, req.params.key as string);
  if (!c) {
    res.status(404).json({ error: 'Config key not found' });
    return;
  }
  res.json(c);
});

export const upsertConfig = wrap(async (req, res) => {
  const c = await configService.upsertConfig(req, req.body);
  res.json(c);
});

export const deleteConfig = wrap(async (req, res) => {
  await configService.deleteConfig(req, req.params.key as string);
  res.status(204).end();
});

export const backupConfig = wrap(async (req, res) => {
  res.json(await configService.backupConfig(req));
});

export const restoreConfig = wrap(async (req, res) => {
  const { snapshot, overwrite } = req.body as { snapshot: { configs: never[] }; overwrite?: boolean };
  const result = await configService.restoreConfig(req, { configs: snapshot.configs }, { overwrite: Boolean(overwrite) });
  res.json(result);
});

// ---------------- Jobs & ATS scraping ----------------
export const adminListJobs = wrap(async (req, res) => {
  const data = await jobsService.listJobs(req, {
    search: req.query.search as string | undefined,
    category: req.query.category as string | undefined,
    sourceAgency: req.query.sourceAgency as string | undefined,
    active: req.query.active as boolean | undefined,
    page: Number(req.query.page ?? 1),
    pageSize: Number(req.query.pageSize ?? 20),
  });
  res.json(data);
});

export const adminGetJob = wrap(async (req, res) => {
  const job = await jobsService.getJob(req, req.params.id as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

export const adminJobActive = wrap(async (req, res) => {
  const job = await jobsService.setJobActive(req, req.params.id as string, Boolean(req.body.active));
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

export const adminDeleteJob = wrap(async (req, res) => {
  const result = await jobsService.deleteJob(req, req.params.id as string);
  if (!result) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(result);
});

export const adminJobFacets = wrap(async (req, res) => {
  res.json(await jobsService.jobFacets());
});

// ---- ATS sources (reuse ats-source service) ----
export const adminListAtsSources = wrap(async (_req, res) => {
  res.json(await atsSourceService.listSources());
});

export const adminCreateAtsSource = wrap(async (req, res) => {
  const source = await atsSourceService.createSource(req.body);
  res.status(201).json(source);
});

export const adminUpdateAtsSource = wrap(async (req, res) => {
  const source = await atsSourceService.updateSource(req.params.id as string, req.body);
  if (!source) {
    res.status(404).json({ error: 'ATS source not found' });
    return;
  }
  res.json(source);
});

export const adminDeleteAtsSource = wrap(async (req, res) => {
  const result = await atsSourceService.deleteSource(req.params.id as string);
  if (!result) {
    res.status(404).json({ error: 'ATS source not found' });
    return;
  }
  res.json(result);
});

/** Scrape a single source ("scrape now"). */
export const adminScrapeSource = wrap(async (req, res) => {
  const result = await jobsService.scrapeSourceById(req, req.params.id as string);
  if (!result) {
    res.status(404).json({ error: 'ATS source not found' });
    return;
  }
  res.json({ ok: true, result });
});

/** Scrape all active sources ("scrape all"). */
export const adminScrapeAll = wrap(async (req, res) => {
  const summary = await jobsService.scrapeAll(req);
  res.json({ ok: true, summary });
});

export const adminAtsAdapterTypes = wrap(async (_req, res) => {
  res.json({ adapterTypes: jobsService.adapterTypes() });
});

// ---------------- Audit + dashboard ----------------
export const listAuditLogs = wrap(async (req, res) => {
  const rows = await listAudit({
    limit: Number(req.query.limit ?? 50),
    action: req.query.action as string | undefined,
    actorUserId: req.query.actorUserId as string | undefined,
    targetType: req.query.targetType as string | undefined,
  });
  res.json(rows);
});

export const adminDashboard = wrap(async (req, res) => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const [totalUsers, activeUsers, providers, auditCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.adminLlmProvider.findMany({ select: { id: true, provider: true, isActive: true, label: true } }),
    prisma.adminAuditLog.count(),
  ]);
  const usage = await llmService.providerUsage(req, undefined, 30).catch(() => null);
  res.json({
    stats: { totalUsers, activeUsers, providers: providers.length, auditCount, usage },
    providers,
    recentAudit: auditCount,
  });
});

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  patchUserActive,
  bulkUserActive,
  userActivity,
  listLlmProviders,
  getLlmProvider,
  createLlmProvider,
  updateLlmProvider,
  deleteLlmProvider,
  llmUsage,
  listConfig,
  getConfigKey,
  upsertConfig,
  deleteConfig,
  backupConfig,
  restoreConfig,
  listAuditLogs,
  adminDashboard,
  adminListJobs,
  adminGetJob,
  adminJobActive,
  adminDeleteJob,
  adminJobFacets,
  adminListAtsSources,
  adminCreateAtsSource,
  adminUpdateAtsSource,
  adminDeleteAtsSource,
  adminScrapeSource,
  adminScrapeAll,
  adminAtsAdapterTypes,
  contextFromRequest,
};