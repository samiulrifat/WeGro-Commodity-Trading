import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SEARCH_MAX_LENGTH } from '../../users/person-search';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PersonNameDto } from '../../../common/swagger/refs';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';
import { Role } from '../../users/roles';
import {
  DetailChangeStatus,
  DetailField,
} from '../entities/detail-change-request.entity';
import { IdCheckDto } from './participant-response.dto';

/** One person's details, in full: their own, or for the admin reviewing a change. */
export class OwnDetailsDto {
  @ApiProperty()
  fullName: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  nid: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '1990-05-14' })
  dateOfBirth: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'BOGURA' })
  district: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  address: string | null;
}

export class DetailChangeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: DetailChangeStatus, enumName: 'DetailChangeStatus' })
  status: DetailChangeStatus;

  @ApiProperty({ type: OwnDetailsDto })
  requested: OwnDetailsDto;

  @ApiProperty({ enum: DetailField, enumName: 'DetailField', isArray: true })
  changedFields: DetailField[];

  @ApiPropertyOptional({ type: IdCheckDto, nullable: true })
  idCheck: IdCheckDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  decidedAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Why it was rejected',
  })
  reason: string | null;
}

export class MyDetailsDto {
  @ApiProperty({ type: OwnDetailsDto })
  current: OwnDetailsDto;

  @ApiPropertyOptional({
    type: DetailChangeDto,
    nullable: true,
    description: 'The latest change asked for: waiting, or how it was decided',
  })
  change: DetailChangeDto | null;

  @ApiProperty({
    description: 'False for the super admin, whose changes apply at once',
  })
  needsApproval: boolean;
}

export class PhoneCodeRequestDto {
  @ApiProperty({ example: '01712345678', description: 'The new number' })
  @IsString()
  @MaxLength(32)
  phone: string;
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** The details as they should be (all of them, changed or not). */
export class DetailChangeRequestDto {
  @ApiProperty({ example: 'Md. Rahim Uddin' })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ example: '01712345678' })
  @IsString()
  @MaxLength(32)
  phone: string;

  @ApiPropertyOptional({ description: 'Not for the super admin' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nid?: string;

  @ApiPropertyOptional({ example: '1990-05-14' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: DISTRICT_CODES, enumName: 'District' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(600)
  address?: string;

  @ApiPropertyOptional({
    example: '482913',
    description: 'The code sent to a new number (POST me/details/phone-code)',
  })
  @IsOptional()
  @Matches(/^\d{6}$/)
  phoneCode?: string;
}

export class DetailChangesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: DetailChangeStatus,
    enumName: 'DetailChangeStatus',
    default: DetailChangeStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(DetailChangeStatus)
  status: DetailChangeStatus = DetailChangeStatus.PENDING;

  @ApiPropertyOptional({
    description: 'Whose: a mobile number, an NID, or whole words of their name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}

export class DetailChangeSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: PersonNameDto,
    description: 'Whose details (current name)',
  })
  participant: PersonNameDto;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: DetailChangeStatus, enumName: 'DetailChangeStatus' })
  status: DetailChangeStatus;

  @ApiProperty({ enum: DetailField, enumName: 'DetailField', isArray: true })
  changedFields: DetailField[];

  @ApiPropertyOptional({
    nullable: true,
    enum: ['passed', 'flagged', 'failed'],
    description: 'The ID check on the requested details',
  })
  idCheckOutcome: 'passed' | 'flagged' | 'failed' | null;

  @ApiProperty()
  createdAt: Date;
}

/** For the admin deciding: what is on file now beside what is asked for. */
export class DetailChangeReviewDto extends DetailChangeSummaryDto {
  @ApiProperty({ type: OwnDetailsDto })
  current: OwnDetailsDto;

  @ApiProperty({ type: OwnDetailsDto })
  requested: OwnDetailsDto;

  @ApiPropertyOptional({ type: IdCheckDto, nullable: true })
  idCheck: IdCheckDto | null;

  @ApiPropertyOptional({ type: PersonNameDto, nullable: true })
  decidedBy: PersonNameDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  decidedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  reason: string | null;
}

export class ApproveDetailChangeDto {
  @ApiPropertyOptional({
    description:
      'Required when the ID check flagged something: confirms the flags were reviewed',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeFlags?: boolean;
}

export class RejectDetailChangeDto {
  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
