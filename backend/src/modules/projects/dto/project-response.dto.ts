import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProduceCategory } from '../../catalog/catalog.enums';
import {
  DurationType,
  ProjectChainState,
  ProjectStage,
  ReservationStatus,
} from '../project.enums';

export class NamedCodeDto {
  @ApiProperty({ example: 'MAIZE' })
  code: string;

  @ApiProperty({ example: 'Maize' })
  name: string;

  @ApiPropertyOptional({ example: 'ভুট্টা' })
  nameBn?: string;
}

export class ProduceRefDto extends NamedCodeDto {
  @ApiProperty({ example: 'kg' })
  unit: string;
}

export class PersonRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  fullName: string;
}

export class SplitDto {
  @ApiProperty({ example: '40.00' })
  farmer: string;

  @ApiProperty({ example: '40.00' })
  investors: string;

  @ApiProperty({ example: '20.00' })
  wegro: string;
}

/** Always labelled: returns are never guaranteed. */
export class EstimatedReturnDto {
  @ApiProperty({ example: '8.00' })
  minPercent: string;

  @ApiProperty({ example: '15.00' })
  maxPercent: string;

  @ApiProperty({
    example: '1600.00',
    description:
      'Taka at the low estimate: per slot on a project, for the slots held on an investment',
  })
  minAmount: string;

  @ApiProperty({ example: '3000.00' })
  maxAmount: string;

  @ApiProperty({
    example:
      'Estimate only. Returns are not guaranteed and depend on the harvest and sale.',
  })
  note: string;
}

export class ProjectDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: ProduceRefDto })
  produce: ProduceRefDto;

  @ApiProperty({ enum: ProduceCategory })
  category: string;

  @ApiProperty({ type: NamedCodeDto })
  district: NamedCodeDto;

  @ApiProperty()
  location: string;

  @ApiProperty({ type: PersonRefDto })
  farmer: PersonRefDto;

  @ApiProperty({ enum: DurationType })
  durationType: DurationType;

  @ApiProperty()
  durationMonths: number;

  @ApiProperty()
  payoutIntervalMonths: number;

  @ApiProperty({ example: '2000000.00' })
  fundingTarget: string;

  @ApiProperty({ example: '20000.00' })
  slotPrice: string;

  @ApiProperty()
  totalSlots: number;

  @ApiProperty()
  issuedSlots: number;

  @ApiProperty()
  reservedSlots: number;

  @ApiProperty()
  availableSlots: number;

  @ApiProperty({ example: '12.00', description: 'Share of slots paid for' })
  fundedPercent: string;

  @ApiProperty({ type: SplitDto })
  split: SplitDto;

  @ApiProperty()
  insured: boolean;

  @ApiProperty({ type: EstimatedReturnDto })
  estimatedReturn: EstimatedReturnDto;

  @ApiPropertyOptional({ nullable: true, type: String })
  plannedStartDate: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '/api/projects/…/cover',
  })
  coverPhotoUrl: string | null;

  @ApiProperty({ description: 'Investors holding slots' })
  investorCount: number;

  @ApiProperty({
    description: 'Investors who reserved slots today (Bangladesh time)',
  })
  investingToday: number;

  @ApiPropertyOptional({
    description: 'Saved by you (investors only)',
  })
  favourite?: boolean;

  @ApiProperty({ enum: ProjectStage })
  stage: ProjectStage;

  @ApiProperty({ enum: ProjectChainState })
  chainState: ProjectChainState;

  @ApiPropertyOptional({ nullable: true, type: String })
  termsHash: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Owed to investors after a cancellation',
  })
  refundTotal: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  publishedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  stageChangedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class ReservationDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty({ type: PersonRefDto })
  investor: PersonRefDto;

  @ApiProperty()
  slots: number;

  @ApiProperty({ example: '80000.00' })
  amount: string;

  @ApiProperty({ enum: ReservationStatus })
  status: ReservationStatus;

  @ApiProperty()
  reservedAt: Date;

  @ApiProperty({ description: 'The deadline; stopped while onHold' })
  expiresAt: Date;

  @ApiProperty({
    description:
      'A payment proof is under review: the clock is stopped and it cannot expire',
  })
  onHold: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Seconds left on the clock while on hold',
  })
  pausedRemainingSeconds: number | null;

  @ApiProperty({ example: '50000.00', description: 'Accepted by Accounts' })
  paid: string;

  @ApiProperty({ example: '0.00', description: 'In proofs not reviewed yet' })
  underReview: string;

  @ApiProperty({ example: '50000.00', description: 'Still to send' })
  remaining: string;

  @ApiPropertyOptional({ nullable: true, type: Date })
  closedAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Accounts, admin and auditor only',
  })
  paymentReference?: string | null;
}

export class HoldingDto {
  @ApiProperty({ type: PersonRefDto })
  investor: PersonRefDto;

  @ApiProperty()
  slots: number;

  @ApiProperty({ example: '80000.00' })
  amount: string;
}

export class RefundLineDto extends HoldingDto {
  @ApiProperty({ enum: ['due', 'submitted', 'refunded'] })
  status: 'due' | 'submitted' | 'refunded';

  @ApiPropertyOptional({ nullable: true, type: String })
  paymentReference: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  recordedAt: Date | null;
}

export class InvestmentDto {
  @ApiProperty({ type: ProjectDto })
  project: ProjectDto;

  @ApiProperty({ description: 'Slots paid for and issued' })
  slots: number;

  @ApiProperty({ example: '80000.00' })
  invested: string;

  @ApiProperty({
    description: 'Slots reserved and awaiting payment confirmation',
  })
  pendingSlots: number;

  @ApiProperty({ type: EstimatedReturnDto, description: 'For the slots held' })
  estimatedReturn: EstimatedReturnDto;
}

export class TimelineEntryDto {
  @ApiProperty()
  at: Date;

  @ApiProperty({
    enum: ['created', 'stage_changed', 'refunds_required', 'field_record'],
  })
  kind: 'created' | 'stage_changed' | 'refunds_required' | 'field_record';

  @ApiPropertyOptional({ enum: ProjectStage })
  stage?: ProjectStage;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'For field_record: open it for photo and readings',
  })
  fieldRecordId?: string;

  @ApiPropertyOptional({ example: 'GROWTH_CHECK' })
  entryType?: string;

  @ApiProperty({ description: 'Ledger transaction' })
  txHash: string;

  @ApiProperty()
  blockNumber: number;
}

export class ProjectIntegrityDto {
  @ApiProperty()
  matches: boolean;

  @ApiProperty({ description: 'Fingerprint recomputed from the stored terms' })
  computedHash: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  ledgerHash: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ProjectStage })
  ledgerStage: ProjectStage | null;

  @ApiProperty({ type: [String] })
  mismatches: string[];
}
