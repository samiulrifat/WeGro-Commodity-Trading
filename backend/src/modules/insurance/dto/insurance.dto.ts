import { PlaceDto } from '../../../common/swagger/refs';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';
import { CODE_PATTERN } from '../../catalog/catalog.enums';
import { ClaimStatus, Severity } from '../insurance.enums';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() || null : value,
  );
const PERCENT = /^(100(\.0)?|\d{1,2}(\.\d)?)$/;
const Percent = () => (target: object, key: string) => {
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )(target, key);
  Matches(PERCENT, {
    message: '$property must be 0 to 100 with at most one decimal place',
  })(target, key);
};
const Taka = () =>
  Matches(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/, {
    message: '$property must be taka as a string, e.g. "300000"',
  });

// --- Requests ---

export class SetCoverageDto {
  @ApiProperty({
    example: '300000',
    description: 'Most the cover pays in total, taka',
  })
  @Taka()
  maxAmount: string;

  @ApiProperty({
    example: ['FLOOD', 'CYCLONE'],
    description: 'Weather event types covered (catalog codes)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @Matches(CODE_PATTERN, { each: true })
  coveredEventTypes: string[];

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'What is covered and on what terms',
    type: String,
  })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class RecordWeatherEventDto {
  @ApiProperty({
    enum: DISTRICT_CODES,
    enumName: 'District',
    example: 'BOGURA',
  })
  @IsIn(DISTRICT_CODES)
  districtCode: string;

  @ApiProperty({ example: 'FLOOD' })
  @Matches(CODE_PATTERN)
  eventTypeCode: string;

  @ApiProperty({
    example: '2026-07-14',
    description: 'Day it happened (Bangladesh)',
  })
  @IsDateString({ strict: true })
  occurredOn: string;

  @ApiProperty({ enum: Severity })
  @IsEnum(Severity)
  severity: Severity;

  @ApiPropertyOptional({
    maxLength: 2000,
    example: 'River above danger level for 4 days',
    type: String,
  })
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ListWeatherEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DISTRICT_CODES, enumName: 'District' })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  districtCode?: string;

  @ApiPropertyOptional({ example: 'FLOOD' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  eventTypeCode?: string;
}

export class OpenClaimDto {
  @ApiProperty({
    format: 'uuid',
    description: "A recorded weather event in the project's district",
  })
  @IsUUID('4')
  eventId: string;

  @ApiProperty({
    example: '40.5',
    description: 'Estimated share of the crop damaged, one decimal place',
    oneOf: [{ type: 'string' }, { type: 'number' }],
  })
  @Percent()
  damagePercent: string | number;

  @ApiProperty({ maxLength: 2000, description: 'What happened to the crop' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  notes: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Up to 5, from POST /photos',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  photoIds?: string[];
}

export class AssessmentDto {
  @ApiPropertyOptional({
    example: '35.0',
    description: 'Damage the insurer found, one decimal place',
    oneOf: [{ type: 'string' }, { type: 'number' }],
  })
  @IsOptional()
  @Percent()
  damagePercent?: string | number | null;

  @ApiProperty({ maxLength: 2000, description: "The assessor's findings" })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  notes: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'From POST /photos',
    type: String,
  })
  @IsOptional()
  @IsUUID('4')
  photoId?: string | null;
}

export class ApproveClaimDto extends AssessmentDto {
  @ApiProperty({
    example: '120000',
    description: 'Taka; within the remaining cover',
  })
  @Taka()
  amount: string;
}

export class ListClaimsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;
}

export class InsuredProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DISTRICT_CODES, enumName: 'District' })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  districtCode?: string;
}

// --- Responses ---

class PartyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class EventTypeRefDto {
  @ApiProperty({ example: 'FLOOD' })
  code: string;

  @ApiProperty({ example: 'Flood' })
  name: string;

  @ApiProperty({ example: 'বন্যা' })
  nameBn: string;
}

export class CoverageVersionDto {
  @ApiProperty({ example: '300000.00' })
  maxAmount: string;

  @ApiProperty({ type: [EventTypeRefDto] })
  coveredEventTypes: EventTypeRefDto[];

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty()
  termsHash: string;

  @ApiProperty({ enum: ['submitted', 'recorded'] })
  status: 'submitted' | 'recorded';

  @ApiPropertyOptional({ nullable: true, type: Date })
  recordedAt: Date | null;
}

export class CoverageDto {
  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty({ type: PartyDto })
  insurer: PartyDto;

  @ApiProperty({
    type: CoverageVersionDto,
    description: 'The latest recorded version',
  })
  current: CoverageVersionDto;

  @ApiProperty({ example: '120000.00', description: 'Approved claims so far' })
  approvedTotal: string;

  @ApiProperty({
    example: '180000.00',
    description: 'Still available for claims',
  })
  remaining: string;

  @ApiProperty({ description: 'Claims waiting for the insurer' })
  openClaims: number;

  @ApiProperty({
    type: [CoverageVersionDto],
    description: 'Earlier versions, newest first',
  })
  history: CoverageVersionDto[];
}

export class InsuredProjectDto {
  @ApiProperty({ type: PartyDto })
  project: PartyDto;

  @ApiProperty({ type: PlaceDto })
  district: { code: string; name: string };

  @ApiProperty({ example: 'MAIZE' })
  produceCode: string;

  @ApiProperty({ example: 'active' })
  stage: string;

  @ApiPropertyOptional({
    nullable: true,
    type: PartyDto,
    description: 'Who covers it, if anyone yet',
  })
  insurer: PartyDto | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  maxAmount: string | null;
}

export class WeatherEventDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: PlaceDto })
  district: { code: string; name: string };

  @ApiProperty({ type: EventTypeRefDto })
  eventType: EventTypeRefDto;

  @ApiProperty({ example: '2026-07-14' })
  occurredOn: string;

  @ApiProperty({ enum: Severity })
  severity: Severity;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ enum: ['submitted', 'recorded'] })
  status: 'submitted' | 'recorded';

  @ApiPropertyOptional({ nullable: true, type: Date })
  recordedAt: Date | null;

  @ApiProperty({ type: PartyDto })
  recordedBy: PartyDto;
}

export class AssessmentViewDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  damagePercent: string | null;

  @ApiProperty()
  notes: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  photoUrl: string | null;
}

export class ClaimDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: PartyDto })
  project: PartyDto;

  @ApiProperty({ type: WeatherEventDto })
  event: WeatherEventDto;

  @ApiProperty({ example: '40.5' })
  damagePercent: string;

  @ApiProperty()
  notes: string;

  @ApiProperty({ type: [String], description: 'Photo URLs' })
  photos: string[];

  @ApiProperty({ type: PartyDto })
  openedBy: PartyDto;

  @ApiProperty({ enum: ClaimStatus })
  status: ClaimStatus;

  @ApiPropertyOptional({ nullable: true, type: Date })
  openedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: AssessmentViewDto })
  assessment: AssessmentViewDto | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '120000.00' })
  approvedAmount: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  decidedAt: Date | null;

  @ApiProperty()
  claimHash: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  assessmentHash: string | null;
}
