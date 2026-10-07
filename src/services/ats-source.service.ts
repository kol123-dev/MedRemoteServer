import { PrismaClient } from '@prisma/client';
import { CreateAtsSourceInput, PatchAtsSourceInput } from '../types/validation/ats.zod.js';
import { syncSource } from './scraper.service.js';
import { listAtsAdapters } from './ats/index.js';

const prisma = new PrismaClient();

export interface AtsSourceDto {
  id: string;
  atsType: string;
  token: string;
  name: string;
  origin?: string | null;
  isActive: boolean;
  createdAt: Date;
}

function toDto(row: {
  id: string;
  atsType: string;
  token: string;
  name: string;
  origin: string | null;
  isActive: boolean;
  createdAt: Date;
}): AtsSourceDto {
  return {
    id: row.id,
    atsType: row.atsType,
    token: row.token,
    name: row.name,
    origin: row.origin,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

/** List all ATS sources (active and inactive). */
export async function listSources(): Promise<AtsSourceDto[]> {
  const rows = await prisma.atsSource.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toDto);
}

/** Create a new ATS source. Throws if the (atsType, token) combo already exists. */
export async function createSource(input: CreateAtsSourceInput): Promise<AtsSourceDto> {
  const existing = await prisma.atsSource.findUnique({
    where: { atsType_token: { atsType: input.atsType, token: input.token } },
  });
  if (existing) {
    const err = new Error(`A source with atsType="${input.atsType}" token="${input.token}" already exists.`);
    (err as { status?: number }).status = 409;
    throw err;
  }
  const row = await prisma.atsSource.create({
    data: {
      atsType: input.atsType,
      token: input.token,
      name: input.name,
      origin: input.origin ?? null,
      isActive: input.isActive,
    },
  });
  return toDto(row);
}

/** Update a source. Returns null if not found. */
export async function updateSource(id: string, patch: PatchAtsSourceInput): Promise<AtsSourceDto | null> {
  const existing = await prisma.atsSource.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.atsSource.update({
    where: { id },
    data: {
      atsType: patch.atsType,
      token: patch.token,
      name: patch.name,
      origin: patch.origin,
      isActive: patch.isActive,
    },
  });
  return toDto(row);
}

/** Soft-delete / disable a source. Returns null if not found. */
export async function deleteSource(id: string): Promise<{ id: string } | null> {
  const existing = await prisma.atsSource.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.atsSource.update({ where: { id }, data: { isActive: false } });
  return { id };
}

/** Run the sync pipeline for a source. Returns null if not found. */
export async function runSource(sourceId: string) {
  const source = await prisma.atsSource.findUnique({ where: { id: sourceId } });
  if (!source) return null;
  return syncSource(source);
}

/** Run sync for all active sources. Returns aggregate result. */
export async function runAllSources() {
  const summary = await (await import('./scraper.service.js')).runScraperSuite();
  return summary;
}

/** Adapter keys available in the registry (for clients/UI to know valid atsTypes). */
export function registeredAdapterTypes(): string[] {
  return listAtsAdapters();
}