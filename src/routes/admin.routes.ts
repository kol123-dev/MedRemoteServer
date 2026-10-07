import { Router } from 'express';
import ctrl from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middleware/validate.middleware.js';
import {
  UserListQueryZod,
  AdminUserCreateZod,
  AdminUserUpdateZod,
  UserActiveZod,
  BulkUserActiveZod,
  LlmProviderCreateZod,
  LlmProviderUpdateZod,
  LlmUsageQueryZod,
  ConfigUpsertZod,
  RestoreConfigZod,
  AuditListQueryZod,
  IdParamZod,
  AdminJobsQueryZod,
  JobActiveZod,
  AtsSourceCreateZod,
  AtsSourcePatchZod,
} from '../types/validation/admin.zod.js';

const router = Router();

// Every admin route requires an authenticated ADMIN role.
router.use(requireAuth());
router.use(requireRole('ADMIN'));

// ---- Dashboard + audit ----
router.get('/dashboard', ctrl.adminDashboard);
router.get('/audit', validateQuery(AuditListQueryZod), ctrl.listAuditLogs);
router.get('/audit/:id', validateParams(IdParamZod), ctrl.listAuditLogs);

// ---- Users ----
router.get('/users', validateQuery(UserListQueryZod), ctrl.listUsers);
router.get('/users/:id', validateParams(IdParamZod), ctrl.getUser);
router.get('/users/:id/activity', validateParams(IdParamZod), ctrl.userActivity);
router.post('/users', validateBody(AdminUserCreateZod), ctrl.createUser);
router.patch('/users/:id', validateParams(IdParamZod), validateBody(AdminUserUpdateZod), ctrl.updateUser);
router.patch('/users/:id/active', validateParams(IdParamZod), validateBody(UserActiveZod), ctrl.patchUserActive);
router.post('/users/bulk-active', validateBody(BulkUserActiveZod), ctrl.bulkUserActive);

// ---- LLM providers ----
router.get('/llm', ctrl.listLlmProviders);
router.get('/llm/usage', validateQuery(LlmUsageQueryZod), ctrl.llmUsage);
router.get('/llm/:id', validateParams(IdParamZod), ctrl.getLlmProvider);
router.post('/llm', validateBody(LlmProviderCreateZod), ctrl.createLlmProvider);
router.patch('/llm/:id', validateParams(IdParamZod), validateBody(LlmProviderUpdateZod), ctrl.updateLlmProvider);
router.delete('/llm/:id', validateParams(IdParamZod), ctrl.deleteLlmProvider);

// ---- Jobs + ATS scraping ----
router.get('/jobs', validateQuery(AdminJobsQueryZod), ctrl.adminListJobs);
router.get('/jobs/facets', ctrl.adminJobFacets);
router.get('/jobs/:id', validateParams(IdParamZod), ctrl.adminGetJob);
router.patch('/jobs/:id/active', validateParams(IdParamZod), validateBody(JobActiveZod), ctrl.adminJobActive);
router.delete('/jobs/:id', validateParams(IdParamZod), ctrl.adminDeleteJob);

router.get('/ats/adapters', ctrl.adminAtsAdapterTypes);
router.get('/ats/sources', ctrl.adminListAtsSources);
router.post('/ats/sources', validateBody(AtsSourceCreateZod), ctrl.adminCreateAtsSource);
router.patch('/ats/sources/:id', validateParams(IdParamZod), validateBody(AtsSourcePatchZod), ctrl.adminUpdateAtsSource);
router.delete('/ats/sources/:id', validateParams(IdParamZod), ctrl.adminDeleteAtsSource);
router.post('/ats/sources/:id/run', validateParams(IdParamZod), ctrl.adminScrapeSource);
router.post('/ats/scrape-all', ctrl.adminScrapeAll);

// ---- System config ----
router.get('/config', ctrl.listConfig);
router.get('/config/backup', ctrl.backupConfig);
router.get('/config/:key', ctrl.getConfigKey);
router.post('/config', validateBody(ConfigUpsertZod), ctrl.upsertConfig);
router.post('/config/restore', validateBody(RestoreConfigZod), ctrl.restoreConfig);
router.patch('/config/:key', validateParams(IdParamZod), validateBody(ConfigUpsertZod), ctrl.upsertConfig);
router.delete('/config/:key', ctrl.deleteConfig);

export default router;