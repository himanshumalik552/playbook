import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ACTION_PRIORITIES,
  type ActionPriority,
  CONFIDENCE_LEVELS,
  type ConfidenceLevel,
  RECOMMENDATION_STATUSES,
  RECOMMENDATION_TYPES,
  type RecommendationStatus,
  type RecommendationType,
} from '@adpulse/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

const ID = /^[a-z0-9]{20,40}$/;
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? value.split(',') : undefined;

export class RecommendationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RECOMMENDATION_STATUSES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsIn(RECOMMENDATION_STATUSES, { each: true })
  status?: RecommendationStatus[];

  @ApiPropertyOptional({ enum: RECOMMENDATION_TYPES })
  @IsOptional()
  @IsIn(RECOMMENDATION_TYPES)
  type?: RecommendationType;
  @ApiPropertyOptional({ enum: CONFIDENCE_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENCE_LEVELS)
  confidence?: ConfidenceLevel;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) campaignId?: string;
}

export class EvidenceItemDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(300) value!: string;
}

export class CreateRecommendationDto {
  @ApiProperty({ enum: RECOMMENDATION_TYPES }) @IsIn(RECOMMENDATION_TYPES) type!: RecommendationType;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(200) title!: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(4000) rationale!: string;

  @ApiProperty({
    type: [EvidenceItemDto],
    description: 'At least one observed data point supporting the recommendation',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EvidenceItemDto)
  evidence!: EvidenceItemDto[];

  @ApiProperty({ enum: CONFIDENCE_LEVELS }) @IsIn(CONFIDENCE_LEVELS) confidence!: ConfidenceLevel;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) campaignId?: string;
}

export class DismissRecommendationDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class ConvertRecommendationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) ownerId?: string;
  @ApiPropertyOptional({ enum: ACTION_PRIORITIES })
  @IsOptional()
  @IsIn(ACTION_PRIORITIES)
  priority?: ActionPriority;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) plannedDate?: string;
}
