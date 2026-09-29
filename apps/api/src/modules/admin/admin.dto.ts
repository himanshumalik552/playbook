import { ApiPropertyOptional } from '@nestjs/swagger';
import { QUEUES, type QueueName } from '@adpulse/config';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

export const QUEUE_NAMES = Object.values(QUEUES);

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Organizations for which the flag is on even when globally disabled',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^[a-z0-9]{20,40}$/, { each: true })
  organizationIds?: string[];
}

export class FailedJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QUEUE_NAMES, description: 'Original queue of the dead-lettered job' })
  @IsOptional()
  @IsIn(QUEUE_NAMES)
  queue?: QueueName;
}
