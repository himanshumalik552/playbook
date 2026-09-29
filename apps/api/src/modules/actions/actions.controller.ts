import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import {
  ActionListQueryDto,
  CommentDto,
  CreateActionDto,
  TransitionActionDto,
  UpdateActionDto,
} from './actions.dto';
import { ActionsService } from './actions.service';

@ApiTags('actions')
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Optimization actions (table view)' })
  list(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Query() query: ActionListQueryDto) {
    return this.actions.list(org, user.id, query);
  }

  @Get('board')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Optimization actions grouped by status (Kanban view)' })
  board(@CurrentOrg() org: OrgContext) {
    return this.actions.board(org);
  }

  @Post()
  @RequirePermissions('actions:create')
  @ApiOperation({ summary: 'Create an optimization action (a plan; nothing is changed in Google Ads)' })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateActionDto,
    @Req() req: AppRequest,
  ) {
    return this.actions.create(org, { userId: user.id, role: org.role }, dto, auditContext(req));
  }

  @Get(':id')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Action detail with comments and change history' })
  get(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.actions.get(org, id);
  }

  @Patch(':id')
  @RequirePermissions('actions:update')
  @ApiOperation({ summary: 'Edit action fields' })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateActionDto,
    @Req() req: AppRequest,
  ) {
    return this.actions.update(org, { userId: user.id, role: org.role }, id, dto, auditContext(req));
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('actions:update')
  @ApiOperation({ summary: 'Move an action through the workflow' })
  transition(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransitionActionDto,
    @Req() req: AppRequest,
  ) {
    return this.actions.transition(org, { userId: user.id, role: org.role }, id, dto, auditContext(req));
  }

  @Post(':id/comments')
  @RequirePermissions('actions:update')
  @ApiOperation({ summary: 'Add a comment' })
  comment(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
    @Req() req: AppRequest,
  ) {
    return this.actions.comment(org, { userId: user.id, role: org.role }, id, dto.body, auditContext(req));
  }

  @Delete(':id')
  @RequirePermissions('actions:assign')
  @ApiOperation({ summary: 'Delete an action (soft delete; history is retained)' })
  async remove(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    await this.actions.remove(org, id, auditContext(req));
    return { deleted: true };
  }
}
