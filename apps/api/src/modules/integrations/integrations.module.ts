import { Module } from '@nestjs/common';
import { AdAccountsController, IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController, AdAccountsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
