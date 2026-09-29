import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
  type AlertSeverity,
  type AlertStatus,
  type AlertType,
} from '@adpulse/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

const ID = /^[a-z0-9]{20,40}$/;
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? value.split(',') : undefined;

export class AlertListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ALERT_STATUSES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsIn(ALERT_STATUSES, { each: true })
  status?: AlertStatus[];

  @ApiPropertyOptional({ enum: ALERT_SEVERITIES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsIn(ALERT_SEVERITIES, { each: true })
  severity?: AlertSeverity[];

  @ApiPropertyOptional({ enum: ALERT_TYPES })
  @IsOptional()
  @IsIn(ALERT_TYPES)
  type?: AlertType;

  @ApiPropertyOptional() @IsOptional() @Matches(ID) adAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) campaignId?: string;

  @ApiPropertyOptional({ description: 'User id, or "me"' })
  @IsOptional()
  @Matches(/^(me|[a-z0-9]{20,40})$/)
  assigneeId?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'severity', 'lastDetectedAt'] })
  @IsOptional()
  @IsIn(['createdAt', 'severity', 'lastDetectedAt'])
  sortBy?: 'createdAt' | 'severity' | 'lastDetectedAt';
}

export class UpdateAlertDto {
  @ApiPropertyOptional({ enum: ALERT_STATUSES })
  @IsOptional()
  @IsIn(ALERT_STATUSES)
  status?: AlertStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(ID)
  assigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class BulkUpdateAlertsDto extends UpdateAlertDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Matches(ID, { each: true })
  ids!: string[];
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({ enum: ALERT_SEVERITIES })
  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: AlertSeverity;

  @ApiPropertyOptional({ description: 'Only keys defined for the rule type are accepted' })
  @IsOptional()
  @IsObject()
  thresholds?: Record<string, number>;
}
