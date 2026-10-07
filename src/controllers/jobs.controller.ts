import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getJobById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const job = await prisma.job.findUnique({ where: { id: String(id) } });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const jobs = await prisma.job.findMany({
      where: { isActive: true },
      // Latest posted first: ATS-ingested jobs carry a real postedAt date; the
      // seeded/local ones fall back to their createdAt so the board is always
      // newest-to-oldest.
      orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }],
    });
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};