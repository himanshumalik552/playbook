import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from '@adpulse/types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, Matches, ValidateIf, ValidateNested } from 'class-validator';

export class ProviderDto {
  @ApiProperty({ enum: INTEGRATION_PROVIDERS })
  @IsIn(INTEGRATION_PROVIDERS)
  provider!: IntegrationProvider;
}

export class SelectAccountsDto {
  @ApiProperty({
    type: [String],
    description: 'Google Ads customer ids (10 digits) to import; others on this connection are deactivated',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @Matches(/^\d{10}$/, { each: true })
  customerIds!: string[];
}

export class PropertyLinkDto {
  @ApiProperty() @Matches(/^[A-Za-z0-9-]{1,40}$/) propertyId!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Ad account whose landing pages this property measures',
  })
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^[a-z0-9]{20,40}$/)
  adAccountId!: string | null;
}

export class SelectPropertiesDto {
  @ApiProperty({ type: [PropertyLinkDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PropertyLinkDto)
  links!: PropertyLinkDto[];
}

export class UpdateAdAccountDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
