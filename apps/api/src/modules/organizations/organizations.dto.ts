import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORG_ROLES, type OrgRole, SUPPORTED_CURRENCIES } from '@adpulse/types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';

function IsTimeZone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isTimeZone',
      target: object.constructor,
      propertyName,
      options: { message: 'Must be a valid IANA timezone', ...options },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
      },
    });
}

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCIES })
  @IsIn(SUPPORTED_CURRENCIES)
  currencyCode!: string;

  @ApiProperty({ example: 'America/New_York' })
  @IsTimeZone()
  timezone!: string;
}

export class ReportingPreferencesDto {
  @IsOptional() @IsInt() @Min(7) @Max(365) defaultDateRangeDays?: number;
  @IsOptional() @IsIn([0, 1]) weekStartsOn?: 0 | 1;
  @IsOptional() @IsBoolean() compareByDefault?: boolean;
  @IsOptional() @IsBoolean() weeklyReportEnabled?: boolean;
  @IsOptional() @IsBoolean() monthlyReportEnabled?: boolean;
  @IsOptional() @IsBoolean() dailySummaryEnabled?: boolean;
}

export class BrandingDto {
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) logoUrl?:
    string | null;
  @IsOptional() @IsString() @MaxLength(200) reportFooter?: string | null;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(SUPPORTED_CURRENCIES) currencyCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsTimeZone() timezone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(90)
  @Max(3650)
  dataRetentionDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportingPreferencesDto)
  reportingPreferences?: ReportingPreferencesDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => BrandingDto) branding?: BrandingDto;
}

export class OnboardingDto {
  @ApiProperty() @IsInt() @Min(0) @Max(5) step!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() completed?: boolean;
}

export class InviteMemberDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ORG_ROLES })
  @IsIn(ORG_ROLES)
  role!: OrgRole;
}

export class UpdateMemberDto {
  @ApiProperty({ enum: ORG_ROLES })
  @IsIn(ORG_ROLES)
  role!: OrgRole;
}

export class AcceptInvitationDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{20,200}$/) token!: string;
}
