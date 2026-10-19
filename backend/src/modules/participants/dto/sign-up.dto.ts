import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/crypto/password-hasher.service';
import { Language } from '../../users/language';
import { Role } from '../../users/roles';
import { RegisterParticipantDto } from './participant-request.dto';

/** The roles someone may sign up as; every other role is registered for them. */
export const SELF_REGISTRABLE_ROLES = [Role.INVESTOR, Role.BUYER] as const;
export type SelfRegistrableRole = (typeof SELF_REGISTRABLE_ROLES)[number];

/** Signing up, step 1: send a code to my number. */
export class SignUpCodeRequestDto {
  @ApiProperty({ example: '01712345678' })
  @IsString()
  @MaxLength(32)
  phone: string;

  @ApiPropertyOptional({
    enum: Language,
    enumName: 'Language',
    description: 'The language of the SMS',
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

/**
 * Signing up as an investor or buyer: the same details as any registration,
 * the code sent to the number, and their own password.
 */
export class SignUpDto extends OmitType(RegisterParticipantDto, ['role']) {
  @ApiProperty({ enum: SELF_REGISTRABLE_ROLES })
  @IsIn(SELF_REGISTRABLE_ROLES)
  role: SelfRegistrableRole;

  @ApiProperty({ example: '482913', description: 'The 6 digits from the SMS' })
  @Matches(/^\d{6}$/)
  phoneCode: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
