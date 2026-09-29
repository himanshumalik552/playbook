import { Module } from '@nestjs/common';
import { AlertRulesController, AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({ controllers: [AlertsController, AlertRulesController], providers: [AlertsService] })
export class AlertsModule {}
