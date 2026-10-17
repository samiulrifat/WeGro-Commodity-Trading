import { ProduceRefDto } from '../../projects/dto/project-response.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';
import { ReceiptStatus, StorageType } from '../warehouse.enums';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ') || null
      : value,
  );

// --- Requests ---

export class CreateSiteDto {
  @ApiProperty({ example: 'Bogura Central Warehouse' })
  @Text()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: DISTRICT_CODES, example: 'BOGURA' })
  @IsIn(DISTRICT_CODES)
  districtCode: string;

  @ApiProperty({ example: 'Shibganj road, Bogura Sadar' })
  @Text()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;

  @ApiProperty({ enum: StorageType })
  @IsEnum(StorageType)
  storageType: StorageType;

  @ApiPropertyOptional({
    example: 500000,
    description: 'Capacity in kg',
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000_000)
  capacityKg?: number | null;
}

/** The intake record shared by issuing and re-checking. */
class IntakeFieldsDto {
  @ApiPropertyOptional({ example: 100, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  bagCount?: number | null;

  @ApiPropertyOptional({
    example: '13.5',
    description: 'Moisture %, one decimal place',
    oneOf: [{ type: 'string' }, { type: 'number' }],
  })
  @IsOptional()
  moisturePercent?: string | number | null;

  @ApiPropertyOptional({ example: 'Bay C-4', type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(40)
  storageBay?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, type: String })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class IssueReceiptDto extends IntakeFieldsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId: string;

  @ApiProperty({
    example: 5000,
    description: 'Whole units of the produce (its catalog unit)',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000_000)
  quantity: number;

  @ApiProperty({ example: '2026-10-12', description: 'Day the goods came in' })
  @IsDateString({ strict: true })
  intakeDate: string;

  @ApiProperty({ example: '2027-04-12', description: 'Valid through this day' })
  @IsDateString({ strict: true })
  expiresOn: string;
}

export class RecheckDto extends IntakeFieldsDto {
  @ApiProperty({
    example: '2027-04-10',
    description: 'Day of the quality re-check',
  })
  @IsDateString({ strict: true })
  checkedOn: string;

  @ApiProperty({
    example: '2027-10-12',
    description: 'New last valid day; must be later than now',
  })
  @IsDateString({ strict: true })
  newExpiresOn: string;
}

export class ListReceiptsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ enum: ReceiptStatus })
  @IsOptional()
  @IsEnum(ReceiptStatus)
  status?: ReceiptStatus;
}

// --- Responses ---

class NamedDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class SiteDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'BOGURA' })
  districtCode: string;

  @ApiProperty({ example: 'Bogura' })
  districtName: string;

  @ApiProperty()
  address: string;

  @ApiProperty({ enum: StorageType })
  storageType: StorageType;

  @ApiPropertyOptional({ nullable: true, type: Number })
  capacityKg: number | null;

  @ApiProperty({ enum: ['submitted', 'registered'] })
  status: 'submitted' | 'registered';

  @ApiProperty({ type: [NamedDto] })
  operators: NamedDto[];
}

export class OwnerDto {
  @ApiProperty({ enum: ['wegro', 'farmer', 'buyer', 'other'] })
  kind: 'wegro' | 'farmer' | 'buyer' | 'other';

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  id: string | null;

  @ApiProperty({ example: 'WeGro' })
  name: string;
}

export class IntakeDto {
  @ApiPropertyOptional({ nullable: true, type: Number })
  bagCount: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '13.5' })
  moisturePercent: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  storageBay: string | null;

  @ApiProperty({ example: '2026-10-12' })
  intakeDate: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;
}

export class RecheckViewDto {
  @ApiProperty()
  checkedOn: string;

  @ApiProperty()
  newExpiresOn: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  bagCount: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  moisturePercent: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  storageBay: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ enum: ['submitted', 'recorded'] })
  status: 'submitted' | 'recorded';
}

export class ReceiptDto {
  @ApiProperty({
    example: '0x…',
    description: 'Ledger id; what the QR encodes',
  })
  id: string;

  @ApiProperty({ type: NamedDto })
  project: NamedDto;

  @ApiProperty({ type: NamedDto })
  site: NamedDto;

  @ApiProperty({ type: OwnerDto })
  owner: OwnerDto;

  @ApiProperty({ type: ProduceRefDto })
  produce: { code: string; name: string; unit: string };

  @ApiProperty({ description: 'Still held under this receipt' })
  quantity: number;

  @ApiProperty()
  originalQuantity: number;

  @ApiProperty({ enum: ReceiptStatus })
  status: ReceiptStatus;

  @ApiProperty({ description: 'A buy-back to WeGro is waiting for an admin' })
  pendingHandover: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Split off from this receipt by a sale',
  })
  parentId: string | null;

  @ApiProperty({ type: IntakeDto })
  intake: IntakeDto;

  @ApiProperty({ example: '2027-04-12' })
  expiresOn: string;

  @ApiProperty({ description: 'Past the last valid day, by the ledger clock' })
  expired: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  issuedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  collectedAt: Date | null;

  @ApiProperty()
  detailsHash: string;

  @ApiProperty()
  verifyUrl: string;
}

export class ReceiptDetailDto extends ReceiptDto {
  @ApiProperty({ type: [RecheckViewDto] })
  rechecks: RecheckViewDto[];

  @ApiProperty({ type: [String], description: 'Receipts split off to buyers' })
  children: string[];
}

/** What anyone scanning a receipt QR sees. Never the owner. */
/** The site that holds a receipt, as the public check shows it. */
export class ReceiptSiteDto {
  @ApiProperty({ example: 'Bogura Central' })
  name: string;

  @ApiProperty({ example: 'Bogura' })
  district: string;
}

export class ReceiptVerificationDto {
  @ApiProperty({
    description: 'On the ledger, and its intake record here still matches',
  })
  genuine: boolean;

  @ApiPropertyOptional({ type: ProduceRefDto, nullable: true })
  produce: { code: string; name: string; nameBn: string; unit: string } | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  quantity: number | null;

  @ApiPropertyOptional({ type: ReceiptSiteDto, nullable: true })
  site: { name: string; district: string } | null;

  @ApiPropertyOptional({ nullable: true, enum: ReceiptStatus })
  status: ReceiptStatus | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  expiresOn: string | null;

  @ApiProperty()
  expired: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  issuedAt: Date | null;

  @ApiProperty({ description: 'A part sold off a larger receipt' })
  partOfLargerReceipt: boolean;
}
