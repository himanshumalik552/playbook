import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { daysInRange, isIsoDate } from '@adpulse/kpi';
import {
  CAMPAIGN_OBJECTIVES,
  type CampaignObjective,
  DEVICES,
  type Device,
  type PaginationMeta,
} from '@adpulse/types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]{20,40}$/;
export const MAX_RANGE_DAYS = 731;

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? value.split(',') : undefined;

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 25;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class MetricsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @Matches(ISO)
  from!: string;

  @ApiPropertyOptional({ example: '2026-09-27' })
  @Matches(ISO)
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  compare = true;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(ID)
  adAccountId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Comma-separated campaign ids' })
  @IsOptional()
  @Transform(toArray)
  @Matches(ID, { each: true })
  campaignIds?: string[];

  @ApiPropertyOptional({ enum: DEVICES })
  @IsOptional()
  @IsIn(DEVICES)
  device?: Device;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9]{1,12}$/)
  locationId?: string;

  @ApiPropertyOptional({ enum: CAMPAIGN_OBJECTIVES })
  @IsOptional()
  @IsIn(CAMPAIGN_OBJECTIVES)
  objective?: CampaignObjective;
}

export class MetricsPageQueryDto extends MetricsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 25;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

/** Rejects impossible or unbounded ranges before they reach SQL. */
export function assertRange(query: { from: string; to: string }): { from: string; to: string } {
  if (!isIsoDate(query.from) || !isIsoDate(query.to)) throw new BadRequestException('Invalid date');
  if (query.from > query.to) throw new BadRequestException('"from" must be on or before "to"');
  if (daysInRange(query) > MAX_RANGE_DAYS)
    throw new BadRequestException(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  return { from: query.from, to: query.to };
}

export function pageMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function paginateArray<T>(items: T[], page: number, pageSize: number) {
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    meta: pageMeta(page, pageSize, items.length),
  };
}
