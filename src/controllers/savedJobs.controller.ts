import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Save jobs struck by the current user and list them back. The user id is taken
 * from the authenticated JWT (`req.user.sub`) — no client-supplied userId needed.
 */

export const saveJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const { id } = req.params;

    const job = await prisma.job.findUnique({ where: { id: String(id) } });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Idempotent save: unique [userId, jobId] so re-saving won't duplicate.
    const saved = await prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId: job.id } },
      update: {},
      create: { userId, jobId: job.id },
    });

    res.status(201).json({ saved: true, id: saved.id, jobId: job.id });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const unsaveJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const { id } = req.params;

    await prisma.savedJob.deleteMany({ where: { userId, jobId: String(id) } });

    res.status(200).json({ saved: false, jobId: String(id) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listSavedJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const savedRows = await prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { job: true },
    });

    res.status(200).json(
      savedRows.map((row) => ({
        id: row.id,
        savedAt: row.createdAt,
        job: row.job,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listSavedJobIds = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const savedRows = await prisma.savedJob.findMany({
      where: { userId },
      select: { jobId: true },
    });

    res.status(200).json({ ids: savedRows.map((row) => row.jobId) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};