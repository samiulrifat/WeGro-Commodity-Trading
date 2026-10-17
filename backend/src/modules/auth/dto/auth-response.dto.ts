import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Language } from '../../users/language';
import { ParticipantStatus, Role } from '../../users/roles';

const LANGUAGE = {
  enum: Language,
  enumName: 'Language',
  nullable: true,
  description: 'The language the person chose; null until chosen (English)',
} as const;

export class SessionUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: ParticipantStatus })
  status: ParticipantStatus;

  @ApiProperty(LANGUAGE)
  language: Language | null;
}

/** Sign-in result. The refresh token is set as an httpOnly cookie, never in the body. */
export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Seconds until the access token expires',
  })
  expiresIn: number;

  @ApiProperty({
    description:
      'True on a temporary password: only change-password is allowed',
  })
  mustChangePassword: boolean;

  @ApiProperty({ type: SessionUserDto })
  user: SessionUserDto;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: ParticipantStatus })
  status: ParticipantStatus;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'BOGURA' })
  district: string | null;

  @ApiProperty({ description: 'On-chain address of your signing key' })
  account: string;

  @ApiProperty()
  mustChangePassword: boolean;

  @ApiProperty()
  isDemo: boolean;

  @ApiProperty(LANGUAGE)
  language: Language | null;
}

export class DemoAccountDto {
  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  fullName: string;
}
