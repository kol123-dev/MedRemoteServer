import jobQueue from '../src/services/queue/jobQueue.js';
import { recalcMatchesForUser } from '../src/services/ai/matching.service.js';

const TICK_INTERVAL_MS = 5000;

jobQueue.process(
  'MATCH_RECALC',
  async (
    payload: { userId?: string; recalcAllJobs?: boolean },
    ctx: { id: string; attempt: number; jobType: string },
  ): Promise<void> => {
    const userId = payload.userId;
    if (!userId) {
      console.warn(
        `[match-worker][${ctx.jobType}] jobId=${ctx.id} skip — no userId in payload`,
      );
      return;
    }

    console.info(
      `[match-worker][${ctx.jobType}] jobId=${ctx.id} attempt=${ctx.attempt} START userId=${userId} recalcAllJobs=${
        payload.recalcAllJobs ?? false
      }`,
    );
    const startedAt = Date.now();

    try {
      const matches = await recalcMatchesForUser(userId);
      const elapsed = Date.now() - startedAt;
      console.info(
        `[match-worker][${ctx.jobType}] jobId=${ctx.id} DONE userId=${userId} matchesUpserted=${matches.length} elapsedMs=${elapsed}`,
      );
    } catch (err: unknown) {
      const elapsed = Date.now() - startedAt;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[match-worker][${ctx.jobType}] jobId=${ctx.id} FAILED userId=${userId} elapsedMs=${elapsed} error=${msg}`,
      );
      throw err;
    }
  },
);

function tickInfo(): void {
  const pending = jobQueue.getPendingCount('MATCH_RECALC');
  const completed = jobQueue.getCompletedCount('MATCH_RECALC');
  console.info(
    `[match-worker] tick @ ${new Date().toISOString()} pending=${pending} completed=${completed}`,
  );
}

console.info(
  `[match-worker] starting standalone worker — processInterval=250ms tickInterval=${TICK_INTERVAL_MS}ms jobType=MATCH_RECALC`,
);

jobQueue.workerStub.start();

tickInfo();
setInterval(tickInfo, TICK_INTERVAL_MS);

process.on('SIGINT', () => {
  console.info('[match-worker] SIGINT — stopping worker stub and exiting');
  jobQueue.workerStub.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.info('[match-worker] SIGTERM — stopping worker stub and exiting');
  jobQueue.workerStub.stop();
  process.exit(0);
});
