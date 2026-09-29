import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TARGET_METRICS, TARGET_SCOPES, type TargetMetric, type TargetScope } from '@adpulse/types';
import { IsIn, IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

const ID = /^[a-z0-9]{20,40}$/;

export class UpsertTargetDto {
  @ApiProperty({ enum: TARGET_SCOPES })
  @IsIn(TARGET_SCOPES)
  scope!: TargetScope;

  @ApiProperty({ enum: TARGET_METRICS })
  @IsIn(TARGET_METRICS)
  metric!: TargetMetric;

  @ApiProperty({
    description: 'CPA in account currency, ROAS as a ratio, CTR/conversion rate/pacing tolerance in percent',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1_000_000)
  value!: number;

  @ApiPropertyOptional()
  @ValidateIf((o: UpsertTargetDto) => o.scope === 'AD_ACCOUNT')
  @Matches(ID)
  adAccountId?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: UpsertTargetDto) => o.scope === 'CAMPAIGN')
  @Matches(ID)
  campaignId?: string;
}

export class TargetHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(ID)
  campaignId?: string;
}
