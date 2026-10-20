import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChainState } from '../../users/entities/user.entity';
import { ParticipantStatus, Role } from '../../users/roles';
import { PersonNameDto } from '../../../common/swagger/refs';
import { IdCheckReason } from '../id-check/id-check';
import { OpenWorkKind, RevocationReason } from '../revocation';

export class IdCheckItemDto {
  @ApiProperty({ example: 'NID_BIRTH_YEAR', description: 'The rule' })
  code: string;

  @ApiProperty({ enum: ['pass', 'warn', 'fail'] })
  result: 'pass' | 'warn' | 'fail';

  @ApiPropertyOptional({
    enum: IdCheckReason,
    enumName: 'IdCheckReason',
    description:
      'Why: worded in the app with `params`. Absent on checks saved before reasons were recorded.',
  })
  reason?: IdCheckReason;

  @ApiProperty({ description: 'The English wording' })
  message: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    example: { issued: 'BOGURA', given: 'DHAKA' },
  })
  params?: Record<string, string | number>;
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

  @ApiProperty({
    description:
      'Rejected after being verified (left, dismissed...), rather than turned down at registration',
  })
  accessRevoked: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class RevocationDto {
  @ApiProperty({ enum: RevocationReason, enumName: 'RevocationReason' })
  reason: RevocationReason;

  @ApiPropertyOptional({ nullable: true, type: String })
  note: string | null;

  @ApiProperty()
  at: Date;

  @ApiPropertyOptional({ nullable: true, type: PersonNameDto })
  by: PersonNameDto | null;
}

export class OpenWorkItemDto {
  @ApiProperty({ enum: OpenWorkKind, enumName: 'OpenWorkKind' })
  kind: OpenWorkKind;

  @ApiProperty({ minimum: 1 })
  count: number;
}

export class OpenWorkDto {
  @ApiProperty({
    type: [OpenWorkItemDto],
    description: 'What they still have open; empty when nothing is',
  })
  items: OpenWorkItemDto[];

  @ApiProperty({
    description:
      'A field officer’s farmers, who must move to another officer in the same step',
  })
  farmersToMove: number;
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

  @ApiPropertyOptional({ nullable: true, type: PersonNameDto })
  registeredBy: PersonNameDto | null;

  @ApiProperty({
    description:
      'Signed up themselves (an investor or buyer), rather than registered by staff',
  })
  selfRegistered: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: PersonNameDto,
    description: 'A farmer’s field officer',
  })
  fieldOfficer: PersonNameDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Their confirmed email address (masked for auditors)',
  })
  email: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  registrationTx: string | null;

  @ApiPropertyOptional({ nullable: true, type: IdCheckDto })
  idCheck: IdCheckDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: RevocationDto,
    description: 'Why and when their access was revoked (while it is)',
  })
  revocation: RevocationDto | null;
}

export class RegisteredParticipantDto {
  @ApiProperty({ type: ParticipantDetailDto })
  participant: ParticipantDetailDto;

  @ApiProperty({
    description:
      'Shown once, never stored in readable form. Also sent to them by SMS; they must change it at first sign-in.',
    example: 'Kp7w-Xq3m-Rt9z',
  })
  temporaryPassword: string;

  @ApiProperty({
    description:
      'Whether the SMS with the temporary password went out; if not, hand it over in person',
  })
  smsSent: boolean;
}

export class TemporaryPasswordDto {
  @ApiProperty({
    description:
      'Shown once, and sent to them by SMS. All existing sessions of the person were ended.',
  })
  temporaryPassword: string;

  @ApiProperty({ description: 'Whether the SMS went out' })
  smsSent: boolean;
}

/** What a registration would meet, before it is sent: nothing is saved. */
export class RegistrationCheckDto {
  @ApiProperty({
    enum: ['passed', 'flagged', 'failed'],
    description:
      'failed: cannot be registered as given; flagged: can, an admin acknowledges the warnings when verifying',
  })
  outcome: 'passed' | 'flagged' | 'failed';

  @ApiProperty({ type: [IdCheckItemDto] })
  checks: IdCheckItemDto[];

  @ApiProperty({
    description: 'Someone is already registered with this number',
  })
  phoneTaken: boolean;

  @ApiProperty({ description: 'Someone is already registered with this NID' })
  nidTaken: boolean;
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
