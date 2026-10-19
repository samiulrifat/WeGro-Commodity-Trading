import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';
import { CODE_PATTERN } from '../../catalog/catalog.enums';
import {
  DurationType,
  ProjectStage,
  ReservationStatus,
} from '../project.enums';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );

/** Taka with up to 2 decimals, as a string so no float is ever involved. */
const TAKA = /^(0|[1-9]\d{0,13})(\.\d{1,2})?$/;
const Taka = () =>
  Matches(TAKA, {
    message: '$property must be taka as a string, e.g. "20000" or "20000.50"',
  });

export class CreateProjectDto {
  @ApiProperty({ example: 'Bogura maize, winter 2026' })
  @Text()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ maxLength: 2000, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ example: 'MAIZE' })
  @Matches(CODE_PATTERN)
  produceCode: string;

  @ApiProperty({
    enum: DISTRICT_CODES,
    enumName: 'District',
    example: 'BOGURA',
  })
  @IsIn(DISTRICT_CODES)
  districtCode: string;

  @ApiProperty({ example: 'Shibganj upazila, Mokamtola union' })
  @Text()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  location: string;

  @ApiProperty({ format: 'uuid', description: 'A verified farmer' })
  @IsUUID()
  farmerId: string;

  @ApiProperty({ enum: DurationType })
  @IsEnum(DurationType)
  durationType: DurationType;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(1)
  @Max(255)
  durationMonths: number;

  @ApiPropertyOptional({
    default: 0,
    description: 'Months between staged payouts; 0 = one final payout',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255)
  payoutIntervalMonths?: number;

  @ApiProperty({
    example: '2000000',
    description: 'Taka; a whole number of slots',
  })
  @Taka()
  fundingTarget: string;

  @ApiProperty({ example: '20000', description: 'Taka per slot' })
  @Taka()
  slotPrice: string;

  @ApiPropertyOptional({
    default: 4000,
    description: 'Basis points: 4000 = 40%',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  farmerBps?: number;

  @ApiPropertyOptional({ default: 4000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  investorBps?: number;

  @ApiPropertyOptional({ default: 2000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  wegroBps?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  insured?: boolean;

  @ApiProperty({
    example: 800,
    description: 'Low estimate of investor return, basis points',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  estimatedReturnMinBps: number;

  @ApiProperty({
    example: 1500,
    description: 'High estimate of investor return, basis points',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  estimatedReturnMaxBps: number;

  @ApiPropertyOptional({ example: '2026-11-15', type: String })
  @IsOptional()
  @IsDateString({ strict: true })
  plannedStartDate?: string | null;
}

/** Any field of a draft; the whole draft is checked again after merging. */
export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(CODE_PATTERN)
  produceCode?: string;

  @ApiPropertyOptional({ enum: DISTRICT_CODES, enumName: 'District' })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  districtCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  @ApiPropertyOptional({ enum: DurationType })
  @IsOptional()
  @IsEnum(DurationType)
  durationType?: DurationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(255)
  durationMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255)
  payoutIntervalMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Taka()
  fundingTarget?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Taka()
  slotPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  farmerBps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  investorBps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  wegroBps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  insured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  estimatedReturnMinBps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  estimatedReturnMaxBps?: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsDateString({ strict: true })
  plannedStartDate?: string | null;
}

export class ListProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProjectStage })
  @IsOptional()
  @IsEnum(ProjectStage)
  stage?: ProjectStage;

  @ApiPropertyOptional({ enum: DurationType })
  @IsOptional()
  @IsEnum(DurationType)
  durationType?: DurationType;

  @ApiPropertyOptional({ example: 'MAIZE' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  produceCode?: string;

  @ApiPropertyOptional({ enum: DISTRICT_CODES, enumName: 'District' })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  districtCode?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Staff only' })
  @IsOptional()
  @IsUUID()
  farmerId?: string;
}

export class ReserveSlotsDto {
  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(10000)
  slots: number;
}

/** A bank or mobile-banking transaction reference. Stored encrypted; the ledger gets a keyed hash. */
export class PaymentReferenceDto {
  @ApiProperty({ example: 'TRX 8F3K2 99120' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  paymentReference: string;
}

export class RecordRefundDto extends PaymentReferenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  investorId: string;
}

export class ListReservationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
