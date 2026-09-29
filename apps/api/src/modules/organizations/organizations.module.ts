import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import {
  InvitationsController,
  MembershipsController,
  OrganizationsController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [UsersModule],
  controllers: [OrganizationsController, MembershipsController, InvitationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
