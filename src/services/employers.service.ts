import { Prisma, PrismaClient, Job, Employer, Role } from '@prisma/client';
import { z } from 'zod';
import { tierOf, tierLimitExhaustedError, PaymentTierId } from '../config/featureFlags.js';

const prisma = new PrismaClient();

export const CreateJobZod = z.object({
  title: z.string().min(3).max(140),
  company: z.string().min(2).max(80),
  description: z.string().min(20).max(20000),
  location: z.string().max(120).optional(),
  requiredSkills: z.string().array(),
  requiredCerts: z.string().array().optional(),
  compensationMinKES: z.number().int().positive().optional(),
  compensationMaxKES: z.number().int().positive().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']),
  remoteEligible: z.boolean().default(false),
  featured: z.boolean().default(false),
  expiresDays: z.number().default(60),
});
export type CreateJobZod = z.infer<typeof CreateJobZod>;

export const ToggleJobStatusZod = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']),
});
export type ToggleJobStatusZod = z.infer<typeof ToggleJobStatusZod>;

export const JobParamsZod = z.object({
  jobId: z.string().uuid(),
});
export type JobParamsZod = z.infer<typeof JobParamsZod>;

export const PurchaseCreditsZod = z.object({
  creditsPackId: z.string(),
});
export type PurchaseCreditsZod = z.infer<typeof PurchaseCreditsZod>;

class TierLimitExhausted extends Error {
  code = 402;
  constructor(message: string) {
    super(message);
    this.name = 'TierLimitExhausted';
  }
}

const FEATURE_TIERS: PaymentTierId[] = ['PREMIUM', 'LIFETIME'];

interface EmployerProfileResult {
  profile: Employer & { userId?: string | null };
  jobsRemainingThisMonth: number;
  canFeature: boolean;
}

function canFeatureForTier(tier: PaymentTierId): boolean {
  return FEATURE_TIERS.includes(tier);
}

function jobsCreditForTier(tier: PaymentTierId): number {
  switch (tier) {
    case 'FREE':
      return 3;
    case 'BASIC':
      return 20;
    case 'PREMIUM':
    case 'LIFETIME':
      return Number.POSITIVE_INFINITY;
    default:
      return 3;
  }
}

async function getOrCreateEmployerProfile(userId: string): Promise<Employer> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  let profile = await prisma.employer.findFirst({
    where: { email: user.email ?? undefined },
  });

  if (!profile) {
    const companyName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : 'Unnamed Company';

    profile = await prisma.employer.create({
      data: {
        companyName,
        email: user.email ?? `employer-${userId}@placeholder.local`,
      },
    });
  }

  return profile;
}

export async function getEmployerProfileByUserId(userId: string): Promise<EmployerProfileResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tier: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const profile = await getOrCreateEmployerProfile(userId);
  const tier: PaymentTierId = tierOf({ tier: user.tier as never });
  const creditCap = jobsCreditForTier(tier);

  let jobsRemainingThisMonth = Number.POSITIVE_INFINITY;
  if (Number.isFinite(creditCap)) {
    const postedCount = await prisma.job.count({
      where: { employerId: profile.id },
    });
    jobsRemainingThisMonth = Math.max(0, creditCap - postedCount);
  }

  const canFeature = canFeatureForTier(tier);

  return {
    profile: { ...profile, userId: user.id },
    jobsRemainingThisMonth,
    canFeature,
  };
}

interface CreateJobResult {
  job: Job;
  jobsRemaining: number;
}

export async function createJob(userId: string, jobData: CreateJobZod): Promise<CreateJobResult> {
  const parsed = CreateJobZod.parse(jobData);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tier: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const tier: PaymentTierId = tierOf({ tier: user.tier as never });
  const creditCap = jobsCreditForTier(tier);
  const profile = await getOrCreateEmployerProfile(userId);

  let jobsRemaining = Number.POSITIVE_INFINITY;
  if (Number.isFinite(creditCap)) {
    const postedCount = await prisma.job.count({
      where: { employerId: profile.id },
    });
    if (postedCount >= creditCap) {
      const err = tierLimitExhaustedError('job-posting', tier);
      throw new TierLimitExhausted(err.error);
    }
    jobsRemaining = creditCap - postedCount - 1;
  }

  const canFeature = canFeatureForTier(tier);
  const isFeatured = canFeature && parsed.featured;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parsed.expiresDays);

  const salaryText = parsed.compensationMinKES && parsed.compensationMaxKES
    ? `KES ${parsed.compensationMinKES} - ${parsed.compensationMaxKES}`
    : parsed.compensationMinKES
      ? `KES ${parsed.compensationMinKES}+`
      : 'Competitive';

  const qualificationText = parsed.requiredCerts && parsed.requiredCerts.length > 0
    ? parsed.requiredCerts.join(', ')
    : '';

  const shiftText = `${parsed.employmentType}${parsed.remoteEligible ? ' · Remote' : ''}`;

  const rawApplyUrlSuffix = crypto.randomUUID();

  const job = await prisma.job.create({
    data: {
      title: parsed.title,
      company: parsed.company,
      description: parsed.description,
      location: parsed.location ?? '',
      skillsRequired: parsed.requiredSkills as unknown as Prisma.InputJsonValue,
      salary: salaryText,
      shift: shiftText,
      qualification: qualificationText,
      rawApplyUrl: `https://medremote.local/apply/${rawApplyUrlSuffix}`,
      category: isFeatured ? 'Premium Featured' : 'Virtual Assistant',
      sourceAgency: 'EMPLOYER_POSTED',
      isActive: true,
      postedAt: new Date(),
      expiresAt,
      employerId: profile.id,
    },
  });

  return { job, jobsRemaining };
}

export async function listPostedJobs(
  userId: string,
  statusFilter: 'ACTIVE' | 'PAUSED' | 'CLOSED' = 'ACTIVE',
): Promise<Job[]> {
  const profile = await getOrCreateEmployerProfile(userId);

  const isActiveFilter = statusFilter === 'ACTIVE';

  return prisma.job.findMany({
    where: {
      employerId: profile.id,
      isActive: isActiveFilter,
    },
    orderBy: { createdAt: 'desc' },
  });
}

interface ToggleJobResult {
  job: Job;
}

export async function toggleJobStatus(
  userId: string,
  jobId: string,
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED',
): Promise<ToggleJobResult> {
  const profile = await getOrCreateEmployerProfile(userId);

  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, employerId: true },
  });

  if (!existing) {
    throw new Error('Job not found');
  }

  if (existing.employerId !== profile.id) {
    throw new Error('Not authorized to modify this job');
  }

  const isActive = status === 'ACTIVE';

  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      isActive,
      expiresAt: status === 'CLOSED' ? new Date() : undefined,
    },
  });

  return { job };
}

interface ApplicantItem {
  userId: string;
  applicationId: string;
  candidateName: string;
  status: string;
  submittedAt: string | null;
  matchScore: number | null;
  atsScore: number | null;
  resumeVersionId: number | null;
  coverLetterId: string | null;
}

interface GetApplicantsResult {
  applicants: ApplicantItem[];
}

export async function getApplicantsForJob(
  userId: string,
  jobId: string,
): Promise<GetApplicantsResult> {
  const profile = await getOrCreateEmployerProfile(userId);

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, employerId: true },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.employerId !== profile.id) {
    throw new Error('Not authorized to view applicants for this job');
  }

  const applications = await prisma.application.findMany({
    where: { jobId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          atsScore: true,
        },
      },
      coverLetter: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const userIds = applications.map((a) => a.userId);

  const latestMatches = userIds.length > 0
    ? await prisma.$queryRaw<Array<{ userId: string; overallPct: number }>>`
        SELECT userId, overallPct
        FROM JobMatch
        WHERE jobId = ${jobId}
          AND userId IN (${Prisma.join(userIds)})
        ORDER BY recalcVersion DESC
      `
    : [];

  const matchByUser = new Map<string, number>();
  for (const m of latestMatches) {
    if (!matchByUser.has(m.userId)) {
      matchByUser.set(m.userId, m.overallPct);
    }
  }

  const applicants: ApplicantItem[] = applications.map((app) => {
    const u = app.user as { id: string; firstName: string | null; lastName: string | null; atsScore: number | null };
    const firstName = u.firstName ?? '';
    const lastName = u.lastName ?? '';
    const candidateName = firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Candidate';

    return {
      userId: u.id,
      applicationId: app.id,
      candidateName,
      status: app.stage,
      submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
      matchScore: matchByUser.get(u.id) ?? null,
      atsScore: u.atsScore,
      resumeVersionId: app.generatedResumeVersionId ?? null,
      coverLetterId: app.coverLetter?.id ?? null,
    };
  });

  return { applicants };
}

interface PurchaseCreditsResult {
  paymentRedirect: string;
  packId: string;
  amountKES: number;
  creditsIncluded: number;
}

interface CreditPack {
  credits: number;
  amountKES: number;
}

type CreditPackId = 'PACK_20_JOBS';

const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  PACK_20_JOBS: { credits: 20, amountKES: 4500 },
};

const DEFAULT_PACK_ID: CreditPackId = 'PACK_20_JOBS';

function resolveCreditPack(packId: string): { id: CreditPackId; pack: CreditPack } {
  const key = packId as CreditPackId;
  if (Object.prototype.hasOwnProperty.call(CREDIT_PACKS, key)) {
    return { id: key, pack: CREDIT_PACKS[key] };
  }
  return { id: DEFAULT_PACK_ID, pack: CREDIT_PACKS[DEFAULT_PACK_ID] };
}

export async function purchaseCredits(
  userId: string,
  creditsPackId: string,
): Promise<PurchaseCreditsResult> {
  const { id: resolvedPackId, pack } = resolveCreditPack(creditsPackId);

  const redirectBase = 'https://paystack.com/pay/medremote-credits';
  const reference = `${userId}-${resolvedPackId}-${Date.now()}`;
  const paymentRedirect = `${redirectBase}?reference=${encodeURIComponent(reference)}&amount=${pack.amountKES * 100}`;

  return {
    paymentRedirect,
    packId: resolvedPackId,
    amountKES: pack.amountKES,
    creditsIncluded: pack.credits,
  };
}
