import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChainState } from '../../users/entities/user.entity';
import { ParticipantStatus, Role } from '../../users/roles';

export class IdCheckItemDto {
  @ApiProperty({ example: 'NID_BIRTH_YEAR' })
  code: string;

  @ApiProperty({ enum: ['pass', 'warn', 'fail'] })
  result: 'pass' | 'warn' | 'fail';

  @ApiProperty()
  message: string;
}

export class IdCheckDto {
  @ApiProperty()
  version: number;

  @ApiProperty({ enum: ['passed', 'flagged'] })
  outcome: 'passed' | 'flagged' | 'failed';

  @ApiProperty({ type: [IdCheckItemDto] })
  checks: IdCheckItemDto[];
}

/** List row. Phone is always masked here. */
export class ParticipantSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: ParticipantStatus })
  status: ParticipantStatus;

  @ApiProperty({ enum: ChainState })
  chainState: ChainState;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ example: '+88017•••••678' })
  phone: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  district: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  fieldOfficerId: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['passed', 'flagged'] })
  idCheckOutcome: 'passed' | 'flagged' | 'failed' | null;

  @ApiProperty()
  createdAt: Date;
}

/** Full record. Personal fields (phone included) are masked for roles that do not need them (auditor). */
export class ParticipantDetailDto extends ParticipantSummaryDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '•••••••••4567',
  })
  nid: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  dateOfBirth: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  address: string | null;

  @ApiProperty({
    description: 'True when personal fields are masked for your role',
  })
  masked: boolean;

  @ApiProperty({ description: 'On-chain address of their signing key' })
  account: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  statusReason: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  statusChangedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  registeredById: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  registrationTx: string | null;

  @ApiPropertyOptional({ nullable: true, type: IdCheckDto })
  idCheck: IdCheckDto | null;
}

export class RegisteredParticipantDto {
  @ApiProperty({ type: ParticipantDetailDto })
  participant: ParticipantDetailDto;

  @ApiProperty({
    description:
      'Shown once, never stored in readable form. Hand it to the person; they must change it at first sign-in.',
    example: 'Kp7w-Xq3m-Rt9z',
  })
  temporaryPassword: string;
}

export class TemporaryPasswordDto {
  @ApiProperty({
    description: 'Shown once. All existing sessions of the person were ended.',
  })
  temporaryPassword: string;
}

export class LedgerParticipantDto {
  @ApiProperty({ enum: ['none', ...Object.values(ParticipantStatus)] })
  status: 'none' | ParticipantStatus;

  @ApiPropertyOptional({ nullable: true, enum: Role })
  role: Role | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  account: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  detailsHash: string | null;
}

/** Recomputes the fingerprint from the stored details and compares it with the ledger. */
export class IntegrityReportDto {
  @ApiProperty({
    description: 'Stored details, database mirror and ledger all agree',
  })
  matches: boolean;

  @ApiProperty({
    description: 'Fingerprint recomputed from the decrypted details now',
  })
  computedHash: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  storedHash: string | null;

  @ApiProperty({ type: LedgerParticipantDto })
  ledger: LedgerParticipantDto;

  @ApiProperty({ type: [String], example: ['status'] })
  mismatches: string[];
}
