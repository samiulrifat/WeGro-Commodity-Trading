import { PersonNameDto } from '../../../common/swagger/refs';
import { ActorDto } from '../../../common/swagger/refs';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  AUDIT_OUTCOMES,
  type AuditOutcome,
} from '../entities/audit-log.entity';

// --- History ---

export class HistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class HistoryActorDto {
  @ApiProperty({
    enum: ['participant', 'system', 'unknown'],
    description: 'System: an automatic platform job',
  })
  kind: 'participant' | 'system' | 'unknown';

  @ApiPropertyOptional({ nullable: true, type: String })
  address: string | null;

  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'accounts' })
  role?: string;
}

export class HistoryEntryDto {
  @ApiProperty()
  at: Date;

  @ApiProperty()
  blockNumber: number;

  @ApiProperty()
  logIndex: number;

  @ApiProperty()
  txHash: string;

  @ApiProperty({ example: 'ProjectLedger' })
  contract: string;

  @ApiProperty({ example: 'ReservationConfirmed' })
  event: string;

  @ApiProperty({ example: 'Reservation paid and slots issued' })
  title: string;

  @ApiProperty({
    type: HistoryActorDto,
    description: 'Who sent the transaction',
  })
  actor: HistoryActorDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Event arguments, readable: taka, ISO times, codes, statuses by name, ids as uuids',
  })
  details: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Names of the people the event refers to, by id or address',
  })
  parties: Record<string, string>;
}

// --- Verify ---

export class VerificationDto {
  @ApiProperty({ example: 'claim' })
  type: string;

  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'The ledger has this record' })
  onLedger: boolean;

  @ApiProperty({
    description: 'Database and ledger agree on everything checked',
  })
  matches: boolean;

  @ApiProperty({
    type: [String],
    example: ['fingerprint', 'status'],
    description: 'What differs',
  })
  mismatches: string[];

  @ApiProperty()
  checkedAt: Date;
}

export class SweepDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['running', 'done', 'failed', 'interrupted'] })
  status: string;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  finishedAt: Date | null;

  @ApiProperty({ type: PersonNameDto })
  startedBy: { id: string; name: string };

  @ApiProperty({ description: 'Records checked so far' })
  checked: number;

  @ApiProperty({ description: 'Records that differ from the ledger' })
  mismatched: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  error: string | null;
}

export class SweepFindingDto {
  @ApiProperty({ example: 'offer' })
  type: string;

  @ApiProperty()
  recordId: string;

  @ApiProperty({ type: [String] })
  mismatches: string[];
}

export class SweepFindingsQueryDto extends PaginationQueryDto {}

// --- Audit log ---

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'From this day (Bangladesh)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Through this day',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    example: '/api/settlement/rounds/:id/approve',
    description: 'Route pattern',
  })
  @IsOptional()
  @Matches(/^\/[\w\-/:.]{0,200}$/)
  route?: string;

  @ApiPropertyOptional({ enum: AUDIT_OUTCOMES })
  @IsOptional()
  @IsIn(AUDIT_OUTCOMES)
  outcome?: AuditOutcome;

  @ApiPropertyOptional({ example: 403 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;
}

export class AuditLogEntryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  at: Date;

  @ApiPropertyOptional({
    type: ActorDto,
    nullable: true,
    description: 'Null when not signed in',
  })
  actor: { id: string; name: string; role: string } | null;

  @ApiProperty({ example: 'POST' })
  method: string;

  @ApiProperty({ example: '/api/settlement/rounds/:id/approve' })
  route: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { id: '12' },
    description: 'Record ids from the path',
  })
  params: Record<string, string>;

  @ApiProperty()
  statusCode: number;

  @ApiProperty({ enum: AUDIT_OUTCOMES })
  outcome: AuditOutcome;

  @ApiPropertyOptional({ nullable: true, type: String })
  requestId: string | null;

  @ApiProperty()
  durationMs: number;
}
