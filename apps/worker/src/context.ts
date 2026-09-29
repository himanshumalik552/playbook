import type { AppEnv } from '@adpulse/config';
import {
  AlertEvaluationService,
  CleanupService,
  createEmailProvider,
  createLogger,
  createRedisConnection,
  createStorageProvider,
  EncryptionService,
  JobQueues,
  type EmailProvider,
  type Logger,
  ProviderFactory,
  PuppeteerPdfRenderer,
  RecommendationService,
  ReportGenerationService,
  SyncService,
} from '@adpulse/core';
import { createPrismaClient, type PrismaClient } from '@adpulse/database';
import type { Redis } from 'ioredis';

export interface WorkerContext {
  env: AppEnv;
  logger: Logger;
  db: PrismaClient;
  redis: Redis;
  queues: JobQueues;
  email: EmailProvider;
  sync: SyncService;
  alerts: AlertEvaluationService;
  recommendations: RecommendationService;
  reports: ReportGenerationService;
  cleanup: CleanupService;
  pdf: PuppeteerPdfRenderer;
}

export function createWorkerContext(env: AppEnv): WorkerContext {
  const logger = createLogger({ level: env.LOG_LEVEL, name: 'adpulse-worker' });
  const db = createPrismaClient();
  const redis = createRedisConnection(env.REDIS_URL);
  const storage = createStorageProvider(env);
  const pdf = new PuppeteerPdfRenderer(env.PUPPETEER_EXECUTABLE_PATH);
  const providers = new ProviderFactory(env);
  const encryption = new EncryptionService(env.ENCRYPTION_KEY);
  return {
    env,
    logger,
    db,
    redis,
    queues: new JobQueues(redis),
    email: createEmailProvider(env, logger),
    sync: new SyncService(db, providers, encryption, logger),
    alerts: new AlertEvaluationService(db, logger),
    recommendations: new RecommendationService(db, logger),
    reports: new ReportGenerationService(db, storage, pdf, logger),
    cleanup: new CleanupService(db, storage, logger),
    pdf,
  };
}
