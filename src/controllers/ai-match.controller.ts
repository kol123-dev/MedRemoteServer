import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  getTopMatches,
  explainMatch,
} from '../services/ai/matching.service.js';
import { enqueue } from '../services/queue/jobQueue.js';
import { MatchListZod } from '../types/validation/ai.zod.js';

const MatchParamsZod = z.object({
  matchId: z.string().min(3),
});

export const listMatchesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }

    const query = MatchListZod.parse(req.query);
    const limit = query.limit;
    const minMatchPct = query.minPct ?? 0;

    const matches = await getTopMatches(userId, limit, minMatchPct);

    res.status(200).json({
      matches,
      meta: {
        limit,
        minMatchPct,
        count: matches.length,
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({
        error: 'Validation failed',
        code: 400,
        details: (err as { issues: unknown }).issues,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to list matches';
    res.status(500).json({ error: message, code: 500 });
  }
};

export const explainMatchHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }

    const params = MatchParamsZod.parse(req.params);
    const matchId = params.matchId;

    const explained = await explainMatch(userId, matchId);

    res.status(200).json({
      match: {
        id: explained.id,
        jobId: explained.jobId,
        overallPct: explained.overallPct,
        skillBreakdown: explained.skillBreakdown,
        reasons: explained.reasons,
        semanticScore: explained.semanticScore,
        keywordScore: explained.keywordScore,
        recalcVersion: explained.recalcVersion,
        job: explained.job,
      },
      explained,
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'issues' in err) {
      res.status(400).json({
        error: 'Validation failed',
        code: 400,
        details: (err as { issues: unknown }).issues,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to explain match';
    if (message === 'Match not found') {
      res.status(404).json({ error: message, code: 404 });
      return;
    }
    res.status(500).json({ error: message, code: 500 });
  }
};

export const triggerRecalcHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Auth required', code: 401 });
      return;
    }

    const jobId = await enqueue(
      'MATCH_RECALC',
      { userId, recalcAllJobs: true },
      { idempotencyKey: `recalc_${userId}_${Date.now()}` },
    );

    res.status(202).json({
      queued: true,
      jobId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to queue recalc';
    res.status(500).json({ error: message, code: 500 });
  }
};
