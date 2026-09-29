import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Exact action or a prefix ending in "." (e.g. "report.")' })
  @IsOptional()
  @Matches(/^[a-z_.]{1,80}$/)
  action?: string;

  @ApiPropertyOptional() @IsOptional() @MaxLength(60) @Matches(/^[A-Za-z_]+$/) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z0-9_-]{1,60}$/) entityId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z0-9]{20,40}$/) actorId?: string;
  @ApiPropertyOptional({ description: 'Inclusive UTC date' }) @IsOptional() @Matches(ISO_DATE) from?: string;
  @ApiPropertyOptional({ description: 'Inclusive UTC date' }) @IsOptional() @Matches(ISO_DATE) to?: string;
}
