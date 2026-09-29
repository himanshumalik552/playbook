import { createServer, type Server } from 'node:http';
import { JOBS, loadEnv, QUEUES, type DeadLetterPayload, type QueueName } from '@adpulse/config';
import { redactSecrets } from '@adpulse/core';
import { type Job, type Processor, Worker } from 'bullmq';
import { createWorkerContext, type WorkerContext } from './context';
import {
  analyticsProcessor,
  emailProcessor,
  maintenanceProcessor,
  reportProcessor,
  syncProcessor,
} from './processors';

function startWorkers(ctx: WorkerContext): Worker[] {
  const concurrency = ctx.env.WORKER_CONCURRENCY;
  const specs: [QueueName, Processor, number][] = [
    [QUEUES.SYNC, syncProcessor(ctx), Math.max(1, Math.floor(concurrency / 2))],
    [QUEUES.ANALYTICS, analyticsProcessor(ctx), 2],
    // Each PDF render holds a Chromium page; keep report concurrency low to bound memory.
    [QUEUES.REPORTS, reportProcessor(ctx), 1],
    [QUEUES.EMAIL, emailProcessor(ctx), concurrency],
    [QUEUES.MAINTENANCE, maintenanceProcessor(ctx), 1],
  ];

  return specs.map(([queue, processor, workerConcurrency]) => {
    const worker = new Worker(queue, processor, {
      connection: ctx.redis,
      concurrency: workerConcurrency,
      lockDuration: queue === QUEUES.SYNC ? 300_000 : 60_000,
    });
    worker.on('completed', (job) =>
      ctx.logger.info({ queue, job: job.name, jobId: job.id }, 'Job completed'),
    );
    worker.on('failed', (job, error) => void onFailed(ctx, queue, job, error));
    worker.on('error', (error) =>
      ctx.logger.error({ queue, err: { message: redactSecrets(error.message) } }, 'Worker error'),
    );
    return worker;
  });
}

async function onFailed(
  ctx: WorkerContext,
  queue: string,
  job: Job | undefined,
  error: Error,
): Promise<void> {
  const reason = redactSecrets(error.message).slice(0, 2000);
  ctx.logger.warn(
    { queue, job: job?.name, jobId: job?.id, attemptsMade: job?.attemptsMade, reason },
    'Job failed',
  );
  if (!job) return;
  const exhausted = error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!exhausted) return;
  const payload: DeadLetterPayload = {
    queue,
    jobName: job.name,
    jobId: job.id,
    data: job.data,
    failedReason: reason,
    attemptsMade: job.attemptsMade,
  };
  await ctx.queues
    .get(QUEUES.DEAD_LETTER)
    .add(JOBS.DEAD_LETTER, payload, { attempts: 1, removeOnComplete: false, removeOnFail: false });
}

async function configureSchedules(ctx: WorkerContext): Promise<void> {
  const maintenance = ctx.queues.get(QUEUES.MAINTENANCE);
  if (!ctx.env.SCHEDULER_ENABLED) {
    await maintenance.removeJobScheduler('schedule-tick');
    await maintenance.removeJobScheduler('data-cleanup');
    ctx.logger.info('Scheduler disabled');
    return;
  }
  // The tick runs hourly in UTC; per-organization timezones are resolved inside the tick.
  await maintenance.upsertJobScheduler(
    'schedule-tick',
    { pattern: '5 * * * *' },
    { name: JOBS.SCHEDULE_TICK, data: {} },
  );
  await maintenance.upsertJobScheduler(
    'data-cleanup',
    { pattern: '30 3 * * *' },
    { name: JOBS.DATA_CLEANUP, data: {} },
  );
}

function startHealthServer(ctx: WorkerContext, workers: Worker[], port: number): Server {
  const server = createServer((req, res) => {
    const respond = (status: number, body: Record<string, unknown>) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/health/live') return respond(200, { status: 'ok' });
    if (req.url === '/health/ready') {
      void Promise.all([
        ctx.queues.ping(),
        ctx.db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      ]).then(([redis, db]) => {
        const running = workers.every((w) => w.isRunning());
        const ok = redis && db && running;
        respond(ok ? 200 : 503, { status: ok ? 'ok' : 'degraded', redis, database: db, workers: running });
      });
      return undefined;
    }
    return respond(404, { status: 'not_found' });
  });
  server.listen(port);
  return server;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const ctx = createWorkerContext(env);
  const workers = startWorkers(ctx);
  await configureSchedules(ctx);
  const health = startHealthServer(ctx, workers, env.WORKER_HEALTH_PORT);
  ctx.logger.info({ queues: Object.values(QUEUES), healthPort: env.WORKER_HEALTH_PORT }, 'Worker started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.logger.info({ signal }, 'Shutting down: waiting for active jobs');
    health.close();
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([ctx.queues.close(), ctx.pdf.close(), ctx.db.$disconnect()]);
    ctx.redis.disconnect();
    ctx.logger.info('Worker stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Worker failed to start: ${redactSecrets(error instanceof Error ? error.message : String(error))}\n`,
  );
  process.exit(1);
});
