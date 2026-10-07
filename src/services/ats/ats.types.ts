/** Minimal shape of an AtsSource row needed by adapters (avoid importing Prisma here). */
export interface AtsSourceLike {
  id: string;
  atsType: string;
  token: string;
  name: string;
  origin?: string | null;
  isActive: boolean;
}

/**
 * Normalized job row that every ATS adapter must produce. It maps 1:1 onto the
 * additive fields of the Prisma `Job` model. `rawApplyUrl` is the idempotency key.
 */
export interface AtsJobInput {
  title: string;
  company: string;
  salary: string;
  shift: string;
  qualification: string;
  rawApplyUrl: string;
  category: string;
  sourceAgency: string;
  description?: string;
  requirements?: string;
  responsibilities?: string;
  location?: string;
  postedAt?: string | null;
}

/** Per-run logging context injected by the scraper (keeps adapters decoupled). */
export interface AtsContext {
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

/** Contract every ATS adapter implements. Registered by `atsType`. */
export interface AtsAdapter {
  readonly atsType: string;
  /** Fetch + normalize jobs for a given source. Never throws; logs via ctx. */
  fetchJobs(source: AtsSourceLike, ctx?: AtsContext): Promise<AtsJobInput[]>;
}