import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CODE_PATTERN,
  InputKind,
  ProduceCategory,
  UnitKind,
} from '../catalog.enums';

/** Trimmed, NFC-normalised text with inner whitespace collapsed. */
const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );

const CodeField = () =>
  Matches(CODE_PATTERN, {
    message: '$property must be 1-31 characters of A-Z, 0-9, _ or -',
  });

class CreateEntryDto {
  @ApiProperty({
    example: 'MAIZE',
    description: 'Written to the ledger; cannot be changed later',
  })
  @IsString()
  @CodeField()
  code: string;

  @ApiProperty({ example: 'Maize' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'ভুট্টা' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nameBn: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

/** Omitted fields stay as they are. Codes and the fields marked fixed cannot change. */
class UpdateEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nameBn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'false hides it from dropdowns; it can never be deleted',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// --- Units ---

export class CreateUnitDto extends CreateEntryDto {
  @ApiProperty({ enum: UnitKind, description: 'Fixed once created' })
  @IsEnum(UnitKind)
  kind: UnitKind;

  @ApiProperty({ example: 'kg' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  symbol: string;

  @ApiProperty({ example: 'কেজি' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  symbolBn: string;
}

export class UpdateUnitDto extends UpdateEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  symbol?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  symbolBn?: string;
}

// --- Produce ---

export class CreateProduceTypeDto extends CreateEntryDto {
  @ApiProperty({ enum: ProduceCategory, description: 'Fixed once created' })
  @IsEnum(ProduceCategory)
  category: ProduceCategory;

  @ApiProperty({ example: 'KG', description: 'Fixed once created' })
  @IsString()
  @CodeField()
  unitCode: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 60, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  typicalDurationMonths?: number | null;

  @ApiPropertyOptional({ maxLength: 500, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 500, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  descriptionBn?: string | null;
}

export class UpdateProduceTypeDto extends UpdateEntryDto {
  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: 60,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  typicalDurationMonths?: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  descriptionBn?: string | null;
}

// --- Inputs ---

export class CreateInputTypeDto extends CreateEntryDto {
  @ApiProperty({ enum: InputKind, description: 'Fixed once created' })
  @IsEnum(InputKind)
  kind: InputKind;

  @ApiProperty({ example: 'KG', description: 'Fixed once created' })
  @IsString()
  @CodeField()
  unitCode: string;

  @ApiPropertyOptional({
    example: 'MAIZE',
    description: 'Crop a seed is for. Fixed once created',
    type: String,
  })
  @IsOptional()
  @IsString()
  @CodeField()
  produceCode?: string | null;

  @ApiPropertyOptional({ maxLength: 500, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateInputTypeDto extends UpdateEntryDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

// --- Field records ---

export class MeasurementDto {
  @ApiProperty({ example: 'plant_height' })
  @Matches(/^[a-z][a-z0-9_]{0,31}$/, {
    message:
      'key must be lower-case letters, digits and _, starting with a letter',
  })
  key: string;

  @ApiProperty({ example: 'Plant Height' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;

  @ApiProperty({ example: 'গাছের উচ্চতা' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  labelBn: string;

  @ApiPropertyOptional({ example: 'cm', nullable: true, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(16)
  unit?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  min?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  max?: number | null;

  @ApiProperty({
    minimum: 0,
    maximum: 3,
    description: 'Decimal places allowed',
  })
  @IsInt()
  @Min(0)
  @Max(3)
  decimals: number;

  @ApiProperty()
  @IsBoolean()
  required: boolean;
}

export class CreateFieldRecordTypeDto extends CreateEntryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresLocation?: boolean;

  @ApiPropertyOptional({ type: [MeasurementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MeasurementDto)
  measurements?: MeasurementDto[];
}

export class UpdateFieldRecordTypeDto extends UpdateEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresLocation?: boolean;

  @ApiPropertyOptional({
    type: [MeasurementDto],
    description: 'Replaces the whole list',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MeasurementDto)
  measurements?: MeasurementDto[];
}

// --- Weather events ---

export class CreateWeatherEventTypeDto extends CreateEntryDto {
  @ApiPropertyOptional({ maxLength: 500, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateWeatherEventTypeDto extends UpdateEntryDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class CatalogQueryDto {
  @ApiPropertyOptional({ description: 'Include deactivated entries' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  includeInactive?: boolean;
}
