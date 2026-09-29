import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { AppEnv } from '@adpulse/config';
import type { JobQueues } from '@adpulse/core';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV, JOB_QUEUES } from '../../infra/tokens';

@ApiTags('health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly db: PrismaService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe: the process is running' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: database and Redis are reachable' })
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([this.db.isHealthy(), this.queues.ping()]);
    const ok = database && redis;
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      version: this.env.APP_VERSION,
      checks: { database: database ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Alias of the readiness probe' })
  health(@Res({ passthrough: true }) res: Response) {
    return this.ready(res);
  }
}
