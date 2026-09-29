import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Req, SkipOrg } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser } from '../../common/request-context';
import { ChangePasswordDto } from '../auth/auth.dto';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}

@ApiTags('users')
@Controller('users/me')
@SkipOrg()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current user with memberships and feature flags' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.currentUser(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto, @Req() req: AppRequest) {
    return this.users.updateProfile(user.id, dto.name, auditContext(req));
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (other sessions are signed out)' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: AppRequest,
  ) {
    await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      user.sessionId,
      auditContext(req),
    );
    return { changed: true };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Active sessions' })
  sessions(@CurrentUser() user: AuthUser) {
    return this.users.sessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoke one of your sessions' })
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: AppRequest) {
    await this.users.revokeSession(user.id, id, auditContext(req));
    return { revoked: true };
  }
}
