import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';
import { ConsentStatus } from '../track-record.enums';
import type { TrackRecordSummary } from '../track-record-summary';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );

// --- Requests ---

export class RegisterBankDto {
  @ApiProperty({ example: 'BRAC Bank PLC', maxLength: 100 })
  @Text()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Bogura Branch', maxLength: 100 })
  @Text()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  branchName: string;

  @ApiProperty({ enum: DISTRICT_CODES, example: 'BOGURA' })
  @IsIn(DISTRICT_CODES)
  districtCode: string;

  @ApiProperty({ example: 'Satmatha, Bogura', maxLength: 300 })
  @Text()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  address: string;
}

export class AssignBankOfficerDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Null removes the officer from their bank',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID('4')
  bankId: string | null;
}

export class GrantConsentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  bankId: string;

  @ApiProperty({
    example: '2027-06-30',
    description: 'Last day the bank may view (Bangladesh), within a year',
  })
  @IsDateString({ strict: true })
  expiresOn: string;

  @ApiProperty({
    format: 'uuid',
    description: "Photo of the farmer's signed consent form, from POST /photos",
  })
  @IsUUID('4')
  evidencePhotoId: string;
}

export class ListBankFarmersQueryDto extends PaginationQueryDto {}

export class ListViewsQueryDto extends PaginationQueryDto {}

export class ListBanksQueryDto {
  @ApiPropertyOptional({ enum: DISTRICT_CODES })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  districtCode?: string;
}

// --- Responses ---

class TrackPartyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class BankDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  branchName: string;

  @ApiProperty({ example: { code: 'BOGURA', name: 'Bogura' } })
  district: { code: string; name: string };

  @ApiProperty()
  address: string;

  @ApiProperty({ enum: ['submitted', 'registered'] })
  status: 'submitted' | 'registered';

  @ApiProperty()
  detailsHash: string;

  @ApiPropertyOptional({
    type: [TrackPartyDto],
    description: 'Assigned officers (admins and auditors)',
  })
  officers?: TrackPartyDto[];
}

export class TrackRecordVersionDto {
  @ApiProperty()
  version: number;

  @ApiProperty()
  publishedAt: Date;

  @ApiProperty({ type: TrackPartyDto })
  publishedBy: TrackPartyDto;

  @ApiProperty({ description: 'Projects covered' })
  projects: number;

  @ApiProperty()
  summaryHash: string;
}

export class TrackRecordDto extends TrackRecordVersionDto {
  @ApiProperty({
    description:
      'Outcomes, money, harvest and sales, and claims of each finished project, with totals',
  })
  summary: TrackRecordSummary;

  @ApiProperty({
    description: 'The summary produces the fingerprint the ledger holds',
  })
  verified: boolean;
}

export class TrackRecordPreviewDto {
  @ApiProperty({ description: 'What would be published now' })
  summary: TrackRecordSummary;

  @ApiPropertyOptional({ nullable: true, type: Number })
  latestVersion: number | null;
}

export class ConsentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: TrackPartyDto })
  bank: TrackPartyDto;

  @ApiProperty({ enum: ConsentStatus })
  status: ConsentStatus;

  @ApiProperty({ description: 'Active and not expired: the bank can view now' })
  current: boolean;

  @ApiProperty({ example: '2027-06-30' })
  expiresOn: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ type: TrackPartyDto })
  grantedBy: TrackPartyDto;

  @ApiPropertyOptional({ nullable: true, type: Date })
  grantedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  revokedAt: Date | null;

  @ApiProperty()
  evidencePhotoUrl: string;

  @ApiProperty()
  evidenceHash: string;

  @ApiProperty({ description: 'Times this bank viewed the track record' })
  views: number;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastViewedAt: Date | null;
}

export class SummaryViewDto {
  @ApiProperty({ type: TrackPartyDto })
  bank: TrackPartyDto;

  @ApiProperty({ type: TrackPartyDto })
  viewer: TrackPartyDto;

  @ApiProperty()
  version: number;

  @ApiProperty()
  viewedAt: Date;
}

export class BankFarmerDto {
  @ApiProperty({ type: TrackPartyDto })
  farmer: TrackPartyDto;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Bogura' })
  district: string | null;

  @ApiProperty({ example: '2027-06-30' })
  expiresOn: string;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Latest published version; null if none yet',
  })
  latestVersion: number | null;
}

export class BankViewDto {
  @ApiProperty({ type: TrackPartyDto })
  farmer: TrackPartyDto;

  @ApiProperty()
  version: number;

  @ApiProperty()
  publishedAt: Date;

  @ApiProperty()
  summary: TrackRecordSummary;

  @ApiProperty()
  summaryHash: string;

  @ApiProperty({
    description: 'The summary produces the fingerprint the ledger returned',
  })
  verified: boolean;

  @ApiProperty({ description: 'This view, as logged on the ledger' })
  viewedAt: Date;

  @ApiProperty()
  txHash: string;
}

export class MyBankDto {
  @ApiPropertyOptional({ nullable: true, type: BankDto })
  bank: BankDto | null;
}

export class ImportedProjectDto {
  @ApiProperty()
  title: string;

  @ApiProperty({ example: { code: 'MAIZE', name: 'Maize', unit: 'kg' } })
  produce: { code: string; name: string; unit: string };

  @ApiProperty({ example: { code: 'BOGURA', name: 'Bogura' } })
  district: { code: string; name: string };

  @ApiProperty({ example: '2024-01-15' })
  startedOn: string;

  @ApiProperty({ example: '2024-06-30' })
  finishedOn: string;

  @ApiProperty()
  fundingRaised: string;

  @ApiProperty()
  income: string;

  @ApiProperty()
  costs: string;

  @ApiProperty({ description: 'Income less costs; below zero is a loss' })
  net: string;

  @ApiProperty()
  farmerReceived: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  harvested: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  sold: string | null;
}
