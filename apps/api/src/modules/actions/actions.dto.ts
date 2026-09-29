import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  type ActionPriority,
  type ActionStatus,
  MONITORED_METRICS,
  RESULT_CLASSIFICATIONS,
  type ResultClassification,
} from '@adpulse/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

const ID = /^[a-z0-9]{20,40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? value.split(',') : undefined;
const nullable = (_o: unknown, v: unknown) => v !== null;

export class AttachmentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) url!: string;
}

export class ActionFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) hypothesis?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) expectedImpact?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @Matches(ID) campaignId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @Matches(ID) adGroupId?: string | null;
  @ApiPropertyOptional({ enum: MONITORED_METRICS })
  @IsOptional()
  @ValidateIf(nullable)
  @IsIn(MONITORED_METRICS)
  metricToMonitor?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @IsNumber() baselineValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @IsNumber() targetValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @Matches(ID) ownerId?: string | null;
  @ApiPropertyOptional({ enum: ACTION_PRIORITIES })
  @IsOptional()
  @IsIn(ACTION_PRIORITIES)
  priority?: ActionPriority;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @Matches(ISO) plannedDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf(nullable) @Matches(ISO) evaluationDate?: string | null;

  @ApiPropertyOptional({ type: [AttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class CreateActionDto extends ActionFieldsDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) alertId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) recommendationId?: string;
}

export class UpdateActionDto extends ActionFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
}

export class TransitionActionDto {
  @ApiProperty({ enum: ACTION_STATUSES }) @IsIn(ACTION_STATUSES) status!: ActionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) cancellationReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) actualResult?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() actualValue?: number;
  @ApiPropertyOptional({ enum: RESULT_CLASSIFICATIONS })
  @IsOptional()
  @IsIn(RESULT_CLASSIFICATIONS)
  resultClassification?: ResultClassification;
}

export class CommentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}

export class ActionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ACTION_STATUSES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsIn(ACTION_STATUSES, { each: true })
  status?: ActionStatus[];

  @ApiPropertyOptional({ enum: ACTION_PRIORITIES })
  @IsOptional()
  @IsIn(ACTION_PRIORITIES)
  priority?: ActionPriority;
  @ApiPropertyOptional({ description: 'User id, or "me"' })
  @IsOptional()
  @Matches(/^(me|[a-z0-9]{20,40})$/)
  ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) campaignId?: string;

  @ApiPropertyOptional({ enum: ['updatedAt', 'plannedDate', 'priority', 'createdAt'] })
  @IsOptional()
  @IsIn(['updatedAt', 'plannedDate', 'priority', 'createdAt'])
  sortBy?: 'updatedAt' | 'plannedDate' | 'priority' | 'createdAt';
}
