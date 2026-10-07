export type JobType =
  | 'MATCH_RECALC'
  | 'APPLICATION_SUBMIT'
  | 'SCRAPE_RUN'
  | 'SUBSCRIPTION_REMINDER'
  | 'MATCH_EXPLAIN';

export interface EnqueueOpts {
  idempotencyKey?: string;
  delayMs?: number;
  priority?: number;
  retry?: { attempts?: number; backoffMs?: number };
}

export interface JobHandlerContext {
  id: string;
  jobType: JobType | string;
  attempt: number;
  enqueuedAt: Date;
  idempotencyKey?: string;
}

export type JobHandler<T = unknown> = (
  payload: T,
  ctx: JobHandlerContext,
) => Promise<void> | void;

interface QueuedJob<T = unknown> {
  id: string;
  jobType: string;
  payload: T;
  enqueuedAt: Date;
  runAt: Date;
  idempotencyKey?: string;
  attempt: number;
  opts?: EnqueueOpts;
}

interface InMemoryJobQueue {
  pending: QueuedJob[];
  handlers: Map<string, JobHandler<any>>;
  idempotency: Map<string, string>;
  completed: Array<{ id: string; jobType: string; finishedAt: Date; ok: boolean; err?: string }>;
  running: boolean;
}

const store: InMemoryJobQueue = {
  pending: [],
  handlers: new Map(),
  idempotency: new Map(),
  completed: [],
  running: false,
};

function makeId(): string {
  return (
    'job_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10)
  );
}

export async function enqueue<T = unknown>(
  jobType: string,
  payload: T,
  opts?: EnqueueOpts,
): Promise<string> {
  if (opts?.idempotencyKey) {
    if (store.idempotency.has(opts.idempotencyKey)) {
      return store.idempotency.get(opts.idempotencyKey)!;
    }
  }

  const id = makeId();
  const job: QueuedJob<T> = {
    id,
    jobType,
    payload,
    enqueuedAt: new Date(),
    runAt: new Date(Date.now() + (opts?.delayMs ?? 0)),
    idempotencyKey: opts?.idempotencyKey,
    attempt: 0,
    opts,
  };

  store.pending.push(job);

  if (opts?.idempotencyKey) {
    store.idempotency.set(opts.idempotencyKey, id);
  }

  if (!store.running) {
    startWorkerStub();
  }

  return id;
}

export function process<T = unknown>(
  jobType: string,
  handler: JobHandler<T>,
): void {
  store.handlers.set(jobType, handler);
}

export function getPendingCount(jobType?: string): number {
  if (!jobType) return store.pending.length;
  return store.pending.filter((j) => j.jobType === jobType).length;
}

export function getCompletedCount(jobType?: string): number {
  if (!jobType) return store.completed.length;
  return store.completed.filter((j) => j.jobType === jobType).length;
}

export function clearQueue(): void {
  store.pending = [];
  store.completed = [];
  store.idempotency.clear();
}

export const workerStub = {
  start: startWorkerStub,
  stop: stopWorkerStub,
  tick: runTick,
  store,
};

let timer: ReturnType<typeof setInterval> | null = null;

function startWorkerStub(): void {
  if (store.running) return;
  store.running = true;
  timer = setInterval(runTick, 250);
}

function stopWorkerStub(): void {
  store.running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function runTick(): Promise<void> {
  if (store.pending.length === 0) return;
  const now = new Date();
  const due = store.pending
    .filter((j) => j.runAt <= now)
    .sort((a, b) => a.runAt.getTime() - b.runAt.getTime());

  for (const job of due) {
    const idx = store.pending.indexOf(job);
    if (idx >= 0) store.pending.splice(idx, 1);
    const handler = store.handlers.get(job.jobType);
    const ctx: JobHandlerContext = {
      id: job.id,
      jobType: job.jobType as JobType | string,
      attempt: job.attempt,
      enqueuedAt: job.enqueuedAt,
      idempotencyKey: job.idempotencyKey,
    };
    let ok = false;
    let errMsg: string | undefined;
    try {
      if (handler) {
        await handler(job.payload, ctx);
      }
      ok = true;
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
      const maxAttempts = job.opts?.retry?.attempts ?? 3;
      if (job.attempt + 1 < maxAttempts) {
        const backoff = job.opts?.retry?.backoffMs ?? 1000;
        job.attempt += 1;
        job.runAt = new Date(Date.now() + backoff * job.attempt);
        store.pending.push(job);
        continue;
      }
    } finally {
      store.completed.push({
        id: job.id,
        jobType: job.jobType,
        finishedAt: new Date(),
        ok,
        err: errMsg,
      });
    }
  }
}

export const jobQueue = {
  enqueue,
  process,
  workerStub,
  getPendingCount,
  getCompletedCount,
  clearQueue,
};

/* ==== BullMQ SWAP INSTRUCTIONS (toggle) ====
 * To swap this in-memory stub for real BullMQ once Redis is live:
 *
 * 1) Set env REDIS_URL per backend/.env.example
 * 2) Install + import:
 *      import { Queue, Worker, QueueEvents } from 'bullmq';
 * 3) Replace store with:
 *      const redisConn = { connection: { host: new URL(env.REDIS_URL).hostname, port: +new URL(env.REDIS_URL).port, password: new URL(env.REDIS_URL).password || undefined } };
 *      const bullQueues = new Map<string, Queue>();
 *      function bullOf(type: string): Queue {
 *        if (!bullQueues.has(type)) bullQueues.set(type, new Queue(type, redisConn));
 *        return bullQueues.get(type)!;
 *      }
 * 4) Rewrite enqueue(): await bullOf(jobType).add(name, payload, {
 *      jobId: opts?.idempotencyKey, delay: opts?.delayMs, attempts: opts?.retry?.attempts, backoff: { type:'exponential', delay: opts?.retry?.backoffMs }
 *    }); return jobId
 * 5) Rewrite process(): new Worker(jobType, (job) => handler(job.data, { id: job.id, jobType, attempt: job.attemptsMade, enqueuedAt: job.timestamp, idempotencyKey: String(job.id) }), redisConn)
 * 6) Keep the same public API so zero downstream call edits required.
 * ===============================================
 */
export default jobQueue;
