import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { type AppEnv, loadEnv } from '@adpulse/config';
import {
  createEmailProvider,
  createErrorReporter,
  createLogger,
  createRedisConnection,
  createStorageProvider,
  EncryptionService,
  JobQueues,
  type Logger,
  ProviderFactory,
} from '@adpulse/core';
import type { Redis } from 'ioredis';
import { PrismaService } from './prisma.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import {
  APP_ENV,
  EMAIL,
  ENCRYPTION,
  ERROR_REPORTER,
  JOB_QUEUES,
  LOGGER,
  PROVIDERS,
  REDIS,
  STORAGE,
} from './tokens';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisThrottlerStorage,
    { provide: APP_ENV, useFactory: () => loadEnv() },
    {
      provide: LOGGER,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => createLogger({ level: env.LOG_LEVEL, name: 'adpulse-api' }),
    },
    {
      provide: REDIS,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => createRedisConnection(env.REDIS_URL, { lazy: true }),
    },
    { provide: JOB_QUEUES, inject: [REDIS], useFactory: (redis: Redis) => new JobQueues(redis) },
    { provide: STORAGE, inject: [APP_ENV], useFactory: (env: AppEnv) => createStorageProvider(env) },
    {
      provide: EMAIL,
      inject: [APP_ENV, LOGGER],
      useFactory: (env: AppEnv, logger: Logger) => createEmailProvider(env, logger),
    },
    {
      provide: ENCRYPTION,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => new EncryptionService(env.ENCRYPTION_KEY),
    },
    { provide: PROVIDERS, inject: [APP_ENV], useFactory: (env: AppEnv) => new ProviderFactory(env) },
    {
      provide: ERROR_REPORTER,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) =>
        createErrorReporter({
          dsn: env.SENTRY_DSN,
          environment: env.NODE_ENV,
          release: env.APP_VERSION,
          service: 'adpulse-api',
        }),
    },
  ],
  exports: [
    PrismaService,
    RedisThrottlerStorage,
    APP_ENV,
    LOGGER,
    REDIS,
    JOB_QUEUES,
    STORAGE,
    EMAIL,
    ENCRYPTION,
    PROVIDERS,
    ERROR_REPORTER,
  ],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queues.close();
    this.redis.disconnect();
  }
}
