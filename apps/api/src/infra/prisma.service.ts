import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@adpulse/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
