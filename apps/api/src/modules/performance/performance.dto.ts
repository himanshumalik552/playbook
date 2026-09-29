import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SEARCH_TERM_FLAGS, type SearchTermFlag } from '@adpulse/types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MetricsPageQueryDto } from '../../common/dto';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class EntityListQueryDto extends MetricsPageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z0-9]{20,40}$/)
  adGroupId?: string;
}

export class SearchTermQueryDto extends EntityListQueryDto {
  @ApiPropertyOptional({ enum: SEARCH_TERM_FLAGS })
  @IsOptional()
  @IsIn(SEARCH_TERM_FLAGS)
  flag?: SearchTermFlag;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  reviewed?: boolean;
}

export class ReviewSearchTermDto {
  @ApiProperty({ description: 'Mark as reviewed (true) or clear the review (false)' })
  @IsBoolean()
  reviewed!: boolean;

  @ApiPropertyOptional({
    description: 'Decision notes, e.g. "Add as negative in Google Ads after checking assisted conversions"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
