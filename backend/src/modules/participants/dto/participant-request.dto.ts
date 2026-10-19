import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ChainState } from '../../users/entities/user.entity';
import { Language } from '../../users/language';
import {
  PARTICIPANT_ROLES,
  type ParticipantRole,
  ParticipantStatus,
} from '../../users/roles';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';

/**
 * Raw input for the practice ID check. Types and lengths are bounded here;
 * the ID check then normalises and validates every field precisely.
 */
export class RegisterParticipantDto {
  @ApiProperty({ enum: PARTICIPANT_ROLES })
  @IsIn(PARTICIPANT_ROLES)
  role: ParticipantRole;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  @IsString()
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ example: '01712345678' })
  @IsString()
  @MaxLength(32)
  phone: string;

  @ApiProperty({
    example: '1990101234567890',
    description: '10-digit smart card NID, or the old 13- or 17-digit NID',
  })
  @IsString()
  @MaxLength(40)
  nid: string;

  @ApiProperty({ example: '1990-05-14', description: 'YYYY-MM-DD' })
  @IsString()
  @MaxLength(20)
  dateOfBirth: string;

  @ApiProperty({
    enum: DISTRICT_CODES,
    enumName: 'District',
    example: 'BOGURA',
  })
  @IsString()
  @MaxLength(40)
  district: string;

  @ApiProperty({ example: 'Village Shibganj, Upazila Shibganj' })
  @IsString()
  @MaxLength(600)
  address: string;

  @ApiPropertyOptional({
    enum: Language,
    enumName: 'Language',
    description:
      'The language WeGro writes to them in (SMS, the app); English if not given',
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

export class VerifyParticipantDto {
  @ApiPropertyOptional({
    description:
      'Required when the ID check flagged something: confirms the admin has reviewed the flags',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeFlags?: boolean;
}

export class RejectParticipantDto {
  @ApiProperty({ minLength: 3, maxLength: 300, description: 'Kept off-chain' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class AssignFieldOfficerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  officerId: string;
}

export class ListParticipantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PARTICIPANT_ROLES })
  @IsOptional()
  @IsIn(PARTICIPANT_ROLES)
  role?: ParticipantRole;

  @ApiPropertyOptional({ enum: ParticipantStatus })
  @IsOptional()
  @IsEnum(ParticipantStatus)
  status?: ParticipantStatus;

  @ApiPropertyOptional({ enum: [ChainState.SUBMITTED, ChainState.CONFIRMED] })
  @IsOptional()
  @IsIn([ChainState.SUBMITTED, ChainState.CONFIRMED])
  chainState?: ChainState;

  @ApiPropertyOptional({ enum: DISTRICT_CODES, enumName: 'District' })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  district?: string;

  @ApiPropertyOptional({ description: 'Exact phone number match' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Exact NID match (13- and 17-digit forms are equivalent)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nid?: string;
}
