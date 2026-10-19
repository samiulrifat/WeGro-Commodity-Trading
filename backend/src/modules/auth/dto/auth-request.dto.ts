import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
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

/** Longest address the mail standards allow. */
export const EMAIL_MAX_LENGTH = 254;

/** Signs in by number or by confirmed email address: give one of the two. */
export class LoginDto {
  @ApiPropertyOptional({
    example: '01712345678',
    description:
      'Bangladeshi mobile number; 01…, 8801…, +8801… and Bengali digits are accepted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({
    example: 'rahim@example.com',
    description: 'A confirmed email address, instead of the number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class DemoLoginDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;
}

/** My own settings. */
export class UpdateMeDto {
  @ApiProperty({ enum: Language, enumName: 'Language' })
  @IsEnum(Language)
  language: Language;
}

/** Send a code to this address, to confirm it is mine. */
export class EmailCodeRequestDto {
  @ApiProperty({ example: 'rahim@example.com' })
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;
}

/** The address again, with the code emailed to it. */
export class ConfirmEmailDto extends EmailCodeRequestDto {
  @ApiProperty({
    example: '482913',
    description: 'The 6 digits from the email',
  })
  @Matches(/^\d{6}$/)
  code: string;
}

/** Forgotten password, step 1: send a code to this number. */
export class PasswordResetRequestDto {
  @ApiProperty({ example: '01712345678' })
  @IsString()
  @MaxLength(32)
  phone: string;
}

/** Step 2: is this the code? (A wrong one counts against it.) */
export class PasswordResetVerifyDto extends PasswordResetRequestDto {
  @ApiProperty({ example: '482913', description: 'The 6 digits from the SMS' })
  @Matches(/^\d{6}$/)
  code: string;
}

/** Step 3: the new password, with the code. */
export class PasswordResetCompleteDto extends PasswordResetVerifyDto {
  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}
