import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  REPORT_FORMATS,
  REPORT_FREQUENCIES,
  REPORT_SECTIONS,
  type ReportFormat,
  type ReportFrequency,
  type ReportSectionKey,
} from '@adpulse/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

const ID = /^[a-z0-9]{20,40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key);
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? value.split(',') : undefined;

export class ReportScopeDto {
  @ApiPropertyOptional({ enum: REPORT_FREQUENCIES, default: 'CUSTOM' })
  @IsOptional()
  @IsIn(REPORT_FREQUENCIES)
  frequency: ReportFrequency = 'CUSTOM';

  @ApiPropertyOptional({ description: 'Defaults to the previous full period for the frequency' })
  @IsOptional()
  @Matches(ISO)
  from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ISO) to?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) adAccountId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @ArrayMaxSize(50)
  @Matches(ID, { each: true })
  campaignIds?: string[];
}

export class GenerateReportDto extends ReportScopeDto {
  @ApiProperty({ enum: REPORT_FORMATS }) @IsIn(REPORT_FORMATS) format!: ReportFormat;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(150) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) commentary?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) templateId?: string;
}

export class ReportListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_FORMATS }) @IsOptional() @IsIn(REPORT_FORMATS) format?: ReportFormat;
  @ApiPropertyOptional({ enum: REPORT_FREQUENCIES })
  @IsOptional()
  @IsIn(REPORT_FREQUENCIES)
  frequency?: ReportFrequency;
}

export class TemplateDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty({ enum: REPORT_FREQUENCIES }) @IsIn(REPORT_FREQUENCIES) frequency!: ReportFrequency;

  @ApiPropertyOptional({ enum: SECTION_KEYS, isArray: true, description: 'Defaults to all sections' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SECTION_KEYS, { each: true })
  sections?: ReportSectionKey[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() scheduleEnabled?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Must be organization members' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsEmail({}, { each: true })
  recipients?: string[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SECTION_KEYS, { each: true })
  sections?: ReportSectionKey[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scheduleEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsEmail({}, { each: true })
  recipients?: string[];
}
