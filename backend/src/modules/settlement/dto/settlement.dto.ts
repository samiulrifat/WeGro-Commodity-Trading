import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaymentReferenceDto } from '../../projects/dto/project-request.dto';
import {
  CostCategory,
  CostStatus,
  PayeeRole,
  RoundStatus,
} from '../settlement.enums';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() : value,
  );
const Taka = () =>
  Matches(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/, {
    message: '$property must be taka as a string, e.g. "1500.00"',
  });
const Bool = () =>
  Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  );

// --- Requests ---

export class AddCostDto {
  @ApiProperty({ enum: CostCategory })
  @IsEnum(CostCategory)
  category: CostCategory;

  @ApiProperty({ example: '1500.00' })
  @Taka()
  amount: string;

  @ApiProperty({ example: '2026-10-10', description: 'Day it was incurred' })
  @IsDateString({ strict: true })
  incurredOn: string;

  @ApiProperty({ maxLength: 1000, example: 'Truck hire, field to hub' })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The bill, from POST /photos',
    type: String,
  })
  @IsOptional()
  @IsUUID('4')
  photoId?: string | null;
}

export class ListCostsQueryDto {
  @ApiPropertyOptional({ description: 'Include voided costs' })
  @IsOptional()
  @Bool()
  @IsBoolean()
  includeVoided?: boolean;
}

export class PrepareRoundDto {
  @ApiProperty({
    description:
      'Final: a project ready for sale, everything finished; also returns capital',
  })
  @IsBoolean()
  final: boolean;
}

export class RejectRoundDto {
  @ApiProperty({ maxLength: 1000 })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}

export class RecordPayoutDto extends PaymentReferenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  payeeId: string;
}

export class ListRoundsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: RoundStatus })
  @IsOptional()
  @IsEnum(RoundStatus)
  status?: RoundStatus;
}

export class PeriodQueryDto {
  @ApiProperty({ example: '2026-07-01', description: 'First day (Bangladesh)' })
  @IsDateString({ strict: true })
  from: string;

  @ApiProperty({ example: '2026-09-30', description: 'Last day, included' })
  @IsDateString({ strict: true })
  to: string;
}

export class StatementQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Payouts approved from this day',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Through this day',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

// --- Responses ---

class SettlementPartyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class CostDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Ledger cost id',
  })
  costId: number | null;

  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty({ enum: CostCategory })
  category: CostCategory;

  @ApiProperty({ example: '1500.00' })
  amount: string;

  @ApiProperty({ example: '2026-10-10' })
  incurredOn: string;

  @ApiProperty()
  note: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  photoUrl: string | null;

  @ApiProperty({ enum: CostStatus })
  status: CostStatus;

  @ApiProperty({ type: SettlementPartyDto })
  enteredBy: SettlementPartyDto;

  @ApiPropertyOptional({ nullable: true, type: Date })
  recordedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: SettlementPartyDto })
  voidedBy: SettlementPartyDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  voidedAt: Date | null;

  @ApiProperty()
  detailsHash: string;
}

export class PreviewDto {
  @ApiProperty({ example: '12000.00', description: 'Profit not yet split' })
  profit: string;

  @ApiProperty()
  farmerShare: string;

  @ApiProperty()
  investorShare: string;

  @ApiProperty()
  wegroShare: string;

  @ApiProperty({ description: 'Final round only' })
  capitalReturn: string;

  @ApiProperty({ description: 'Rounding remainder, kept by WeGro' })
  leftover: string;

  @ApiProperty()
  payees: number;
}

export class RoundEligibilityDto {
  @ApiProperty()
  allowed: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'TOO_EARLY',
    description: 'Why not, when not allowed',
  })
  reason: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description: 'Staged: earliest time',
  })
  nextAllowedAt: Date | null;

  @ApiProperty({
    type: [String],
    example: ['STORED_CROP', 'CLAIMS'],
    description: 'Final: what is still unfinished',
  })
  outstanding: string[];

  @ApiPropertyOptional({
    nullable: true,
    type: PreviewDto,
    description: 'If prepared now',
  })
  preview: PreviewDto | null;
}

class AmountBreakdownDto {
  @ApiProperty({ example: '40010.00' })
  total: string;
}

export class IncomeDto extends AmountBreakdownDto {
  @ApiProperty({ description: 'Delivered sales' })
  sales: string;

  @ApiProperty({ description: 'Approved insurance claims' })
  insurance: string;
}

export class CostsDto extends AmountBreakdownDto {
  @ApiProperty({ description: 'Confirmed voucher spending' })
  inputs: string;

  @ApiProperty({ description: 'Costs Accounts entered' })
  other: string;
}

export class RoundSummaryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  isFinal: boolean;

  @ApiProperty({ enum: RoundStatus })
  status: RoundStatus;

  @ApiProperty()
  profit: string;

  @ApiProperty()
  capitalReturn: string;

  @ApiProperty()
  preparedAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  approvedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  paidAt: Date | null;
}

export class SettlementSummaryDto {
  @ApiProperty({ type: SettlementPartyDto })
  project: SettlementPartyDto;

  @ApiProperty({ example: 'active' })
  stage: string;

  @ApiProperty({ type: IncomeDto, description: 'From the ledger, so far' })
  income: IncomeDto;

  @ApiProperty({ type: CostsDto, description: 'From the ledger, so far' })
  costs: CostsDto;

  @ApiProperty({
    example: '-500.00',
    description: 'Income less costs; below zero is a loss',
  })
  net: string;

  @ApiProperty({ description: 'Profit already split in approved rounds' })
  distributedProfit: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  openRoundId: number | null;

  @ApiProperty({ description: 'The final round is approved' })
  settled: boolean;

  @ApiProperty({ type: RoundEligibilityDto })
  staged: RoundEligibilityDto;

  @ApiProperty({ type: RoundEligibilityDto })
  final: RoundEligibilityDto;

  @ApiProperty({ type: [RoundSummaryDto] })
  rounds: RoundSummaryDto[];
}

export class PayoutLineDto {
  @ApiProperty({ type: SettlementPartyDto })
  payee: SettlementPartyDto;

  @ApiPropertyOptional({ nullable: true, enum: PayeeRole })
  role: PayeeRole | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  slots: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '5600.00' })
  amount: string | null;

  @ApiProperty({ description: 'As on the ledger' })
  lineHash: string;

  @ApiProperty({ description: 'The amount produces the ledger hash' })
  verified: boolean;

  @ApiProperty()
  paid: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  paidAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Accounts, admins and auditors only',
  })
  paymentReference?: string | null;
}

export class RoundListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: SettlementPartyDto })
  project: SettlementPartyDto;

  @ApiProperty()
  isFinal: boolean;

  @ApiProperty({ enum: RoundStatus })
  status: RoundStatus;

  @ApiProperty()
  income: string;

  @ApiProperty()
  costs: string;

  @ApiProperty()
  profit: string;

  @ApiProperty()
  farmerShare: string;

  @ApiProperty()
  investorShare: string;

  @ApiProperty()
  wegroShare: string;

  @ApiProperty()
  capitalReturn: string;

  @ApiProperty()
  leftover: string;

  @ApiProperty()
  fingerprint: string;

  @ApiProperty({ description: 'Figures and every line match the ledger' })
  verified: boolean;

  @ApiProperty({ type: SettlementPartyDto })
  preparedBy: SettlementPartyDto;

  @ApiProperty()
  preparedAt: Date;

  @ApiPropertyOptional({ nullable: true, type: SettlementPartyDto })
  approvedBy: SettlementPartyDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  approvedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  rejectReason: string | null;

  @ApiPropertyOptional({ nullable: true, type: SettlementPartyDto })
  rejectedBy: SettlementPartyDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  rejectedAt: Date | null;

  @ApiProperty()
  payeeCount: number;

  @ApiProperty()
  paidCount: number;

  @ApiPropertyOptional({ nullable: true, type: Date })
  paidAt: Date | null;
}

export class RoundDto extends RoundListItemDto {
  @ApiProperty({ type: [PayoutLineDto] })
  lines: PayoutLineDto[];
}

export class StatementPayoutDto {
  @ApiProperty()
  roundId: number;

  @ApiProperty()
  isFinal: boolean;

  @ApiProperty()
  approvedAt: Date;

  @ApiProperty({ example: '5600.00' })
  amount: string;

  @ApiProperty()
  paid: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  paidAt: Date | null;

  @ApiProperty({ description: 'Check against SettlementLedger.payoutLineHash' })
  lineHash: string;

  @ApiProperty({ description: 'The amount produces the ledger hash' })
  verified: boolean;
}

export class StatementProjectDto {
  @ApiProperty({ type: SettlementPartyDto })
  project: SettlementPartyDto;

  @ApiProperty({ example: 'paid_out' })
  stage: string;

  @ApiProperty({ enum: PayeeRole })
  role: PayeeRole;

  @ApiPropertyOptional({ nullable: true, type: Number })
  slots: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Investors: slots x slot price',
  })
  invested: string | null;

  @ApiProperty({ type: [StatementPayoutDto] })
  payouts: StatementPayoutDto[];

  @ApiProperty({ description: 'Paid to you' })
  received: string;

  @ApiProperty({ description: 'Approved, not yet paid' })
  due: string;

  @ApiProperty({
    description: 'Capital paid back when a project was cancelled',
  })
  refunded: string;
}

export class StatementTotalsDto {
  @ApiProperty()
  invested: string;

  @ApiProperty()
  received: string;

  @ApiProperty()
  due: string;

  @ApiProperty()
  refunded: string;
}

export class StatementDto {
  @ApiProperty({ type: SettlementPartyDto })
  payee: SettlementPartyDto;

  @ApiPropertyOptional({ nullable: true, type: String })
  from: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  to: string | null;

  @ApiProperty({ type: [StatementProjectDto] })
  projects: StatementProjectDto[];

  @ApiProperty({ type: StatementTotalsDto })
  totals: StatementTotalsDto;

  @ApiProperty({ example: 'Estimates are not guaranteed …' })
  note: string;
}
