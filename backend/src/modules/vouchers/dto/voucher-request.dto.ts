import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
import { CODE_PATTERN } from '../../catalog/catalog.enums';
import { SaleStatus, VoucherStatus } from '../voucher.enums';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );

/** Whole units of the input: the ledger counts in integers. */
const MAX_QUANTITY = 1_000_000_000_000;

export class ProposeVoucherDto {
  @ApiProperty({ example: 'UREA' })
  @Matches(CODE_PATTERN)
  inputTypeCode: string;

  @ApiProperty({
    example: 150,
    description: 'Whole units of the input (its catalog unit)',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity: number;

  @ApiProperty({
    example: '27.50',
    description: "Taka per unit at today's market price",
  })
  @Matches(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/, {
    message: 'unitPrice must be taka as a string, e.g. "27.50"',
  })
  unitPrice: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: '1 to 20 verified suppliers',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  supplierIds: string[];
}

export class InactivityLimitDto {
  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: 3650,
    description:
      'Days without activity before the voucher is flagged; null removes the limit',
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days: number | null;
}

export class ListVouchersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: VoucherStatus })
  @IsOptional()
  @IsEnum(VoucherStatus)
  status?: VoucherStatus;

  @ApiPropertyOptional({
    description: 'Only vouchers past their inactivity limit',
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  inactive?: boolean;

  @ApiPropertyOptional({ example: 'UREA' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  inputTypeCode?: string;
}

export class RecordSaleDto {
  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity: number;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Your registered batches of this input the goods came from (up to 20)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  batchIds?: string[];
}

export class ListSalesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SaleStatus })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  voucherId?: string;
}

export class RegisterBatchDto {
  @ApiProperty({ example: 'UREA' })
  @Matches(CODE_PATTERN)
  inputTypeCode: string;

  @ApiProperty({
    example: 'KF-2026-0412',
    description: 'Lot number as printed on the goods',
  })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  lotNumber: string;

  @ApiPropertyOptional({
    example: 2000,
    description: 'Batch size in the input unit',
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity?: number | null;

  @ApiPropertyOptional({ example: 'Karnaphuli Fertilizer', type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(120)
  manufacturer?: string | null;

  @ApiProperty({
    example: '2026-09-01',
    description: 'Calendar day in Bangladesh',
  })
  @IsDateString({ strict: true })
  producedOn: string;

  @ApiPropertyOptional({
    example: '2028-08-31',
    description: 'Usable through this day',
    type: String,
  })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresOn?: string | null;

  @ApiPropertyOptional({ maxLength: 500, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ListBatchesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'UREA' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  inputTypeCode?: string;
}
