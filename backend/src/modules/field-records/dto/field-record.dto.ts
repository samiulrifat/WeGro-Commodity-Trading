import { PersonNameDto } from '../../../common/swagger/refs';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CODE_PATTERN } from '../../catalog/catalog.enums';
import { ProjectStage } from '../../projects/project.enums';

/** One farm update as saved on the officer's phone. */
export class FieldRecordDraftDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Generated on the phone; resending it never duplicates',
  })
  @IsUUID('4')
  id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId: string;

  @ApiProperty({ example: 'GROWTH_CHECK' })
  @Matches(CODE_PATTERN)
  entryTypeCode: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() || null : value,
  )
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    example: { plant_height: '42', crop_cover: 80 },
    description: 'Readings by key, as the record type defines them',
  })
  @IsOptional()
  @IsObject()
  measurements?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: '24.846512',
    description: 'Decimal degrees, up to 6 places',
    oneOf: [{ type: 'string' }, { type: 'number' }],
  })
  @IsOptional()
  latitude?: string | number;

  @ApiPropertyOptional({
    example: '89.377621',
    oneOf: [{ type: 'string' }, { type: 'number' }],
  })
  @IsOptional()
  longitude?: string | number;

  @ApiPropertyOptional({
    example: 8,
    description: 'GPS accuracy in metres',
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  accuracyMeters?: number | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'From POST /photos',
    type: String,
  })
  @IsOptional()
  @IsUUID('4')
  photoId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The record this one corrects',
    type: String,
  })
  @IsOptional()
  @IsUUID('4')
  correctsEntryId?: string | null;

  @ApiProperty({
    example: '2026-10-12T09:30:00+06:00',
    description: "When it was observed, by the phone's clock",
  })
  @IsDateString({ strict: true })
  observedAt: string;
}

export class SyncFieldRecordsDto {
  @ApiProperty({ type: [FieldRecordDraftDto], description: '1 to 50 drafts' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FieldRecordDraftDto)
  records: FieldRecordDraftDto[];
}

export class ListFieldRecordsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'GROWTH_CHECK' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  entryTypeCode?: string;
}

/** Farm updates across projects: an officer's own, or every one for staff. */
export class ListAllFieldRecordsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'GROWTH_CHECK' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  entryTypeCode?: string;

  @ApiPropertyOptional({ enum: ['submitted', 'recorded'] })
  @IsOptional()
  @IsIn(['submitted', 'recorded'])
  status?: 'submitted' | 'recorded';

  @ApiPropertyOptional({
    description:
      'Words of the project title, or the farmer: a mobile number, an NID or whole words of their name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// --- Responses ---

export class MeasurementValueDto {
  @ApiProperty({ example: 'plant_height' })
  key: string;

  @ApiProperty({ example: 'Plant Height' })
  label: string;

  @ApiProperty({ example: 'গাছের উচ্চতা' })
  labelBn: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'cm' })
  unit: string | null;

  @ApiProperty({ example: '42' })
  value: string;
}

export class LocationDto {
  @ApiProperty({ example: '24.846512' })
  latitude: string;

  @ApiProperty({ example: '89.377621' })
  longitude: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  accuracyMeters: number | null;

  @ApiProperty({ description: 'False: rounded to about 1 km for your role' })
  exact: boolean;
}

export class PhotoRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '/api/field-records/…/photo' })
  url: string;

  @ApiProperty({ description: 'SHA-256 of the file, as on the ledger' })
  photoHash: string;
}

export class FieldRecordDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty({ example: 'Maize in Bogura' })
  projectTitle: string;

  @ApiProperty({ type: PersonNameDto, description: "The project's farmer" })
  farmer: { id: string; name: string };

  @ApiProperty({ example: 'GROWTH_CHECK' })
  entryTypeCode: string;

  @ApiProperty({ example: 'Growth Check' })
  entryTypeName: string;

  @ApiProperty({ example: 'বৃদ্ধি পর্যবেক্ষণ' })
  entryTypeNameBn: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ type: [MeasurementValueDto] })
  measurements: MeasurementValueDto[];

  @ApiPropertyOptional({ nullable: true, type: LocationDto })
  location: LocationDto | null;

  @ApiPropertyOptional({ nullable: true, type: PhotoRefDto })
  photo: PhotoRefDto | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  correctsEntryId: string | null;

  @ApiProperty({
    type: [String],
    description: 'Later records that correct this one',
  })
  correctedBy: string[];

  @ApiProperty({ type: PersonNameDto })
  recordedBy: { id: string; name: string };

  @ApiProperty()
  observedAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description: 'Ledger time',
  })
  recordedAt: Date | null;

  @ApiProperty({ enum: ['submitted', 'recorded'] })
  status: 'submitted' | 'recorded';

  @ApiProperty()
  dataHash: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ledger transaction',
  })
  txHash: string | null;
}

export class SyncResultDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: ['recorded', 'already_recorded', 'pending', 'rejected'],
    description:
      'recorded: new; already_recorded: sent before, nothing duplicated; pending: keep the draft and resend later; rejected: fix and resend',
  })
  outcome: 'recorded' | 'already_recorded' | 'pending' | 'rejected';

  @ApiPropertyOptional({
    description:
      'Why it was rejected: an error code, as in error responses (ErrorCode or a ledger error name)',
  })
  code?: string;

  @ApiPropertyOptional({ description: 'English wording' })
  message?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'The values in the wording, as in error responses',
  })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ type: FieldRecordDto })
  record?: FieldRecordDto;
}

export class PhotoDto {
  @ApiProperty({ format: 'uuid', description: 'Use as photoId in a record' })
  id: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty()
  photoHash: string;
}

export class FieldRecordVerificationDto {
  @ApiProperty({
    description: 'Data and photo both reproduce the ledger fingerprints',
  })
  matches: boolean;

  @ApiProperty({ description: 'Recomputed from the stored values' })
  dataHash: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  ledgerDataHash: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Recomputed from the file on disk',
  })
  photoHash: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  ledgerPhotoHash: string | null;

  @ApiProperty({ type: [String] })
  mismatches: string[];
}

/** A project an officer may record farm updates for, as the phone keeps it offline. */
export class OfficerProjectDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({
    enum: [
      ProjectStage.FUNDED,
      ProjectStage.ACTIVE,
      ProjectStage.READY_FOR_SALE,
    ],
  })
  stage: ProjectStage;

  @ApiProperty({ type: PersonNameDto })
  farmer: { id: string; name: string };

  @ApiProperty({ example: 'Shibganj' })
  location: string;

  @ApiProperty({ example: 'Bogura' })
  district: string;

  @ApiProperty({ example: 'Maize' })
  produceName: string;

  @ApiProperty({ example: 'ভুট্টা' })
  produceNameBn: string;
}
