import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DashRefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class FundingProjectDto {
  @ApiProperty({ type: DashRefDto })
  project: DashRefDto;

  @ApiProperty({ type: DashRefDto })
  farmer: DashRefDto;

  @ApiProperty({ example: 'MAIZE' })
  produceCode: string;

  @ApiProperty({ example: 'BOGURA' })
  districtCode: string;

  @ApiProperty({ example: '500000.00' })
  target: string;

  @ApiProperty({
    example: '200000.00',
    description: 'Slots issued x slot price',
  })
  raised: string;

  @ApiProperty({
    example: '40.0',
    description: 'Issued slots as % of all slots',
  })
  percentFunded: string;

  @ApiProperty()
  totalSlots: number;

  @ApiProperty()
  issuedSlots: number;

  @ApiProperty({ description: 'Held by unpaid reservations' })
  reservedSlots: number;

  @ApiProperty({ description: 'Reservations waiting for payment confirmation' })
  pendingReservations: number;

  @ApiPropertyOptional({ nullable: true, type: Date })
  publishedAt: Date | null;

  @ApiProperty({ description: 'Whole days open for funding' })
  daysOpen: number;
}

export class FundingDto {
  @ApiProperty()
  openProjects: number;

  @ApiProperty()
  target: string;

  @ApiProperty()
  raised: string;

  @ApiProperty({
    example: '42.5',
    description: 'Raised as % of target, all open projects',
  })
  percentFunded: string;

  @ApiProperty({
    type: [FundingProjectDto],
    description: 'Longest open first, up to 20',
  })
  projects: FundingProjectDto[];
}

export class ActiveProjectDto {
  @ApiProperty({ type: DashRefDto })
  project: DashRefDto;

  @ApiProperty({ type: DashRefDto })
  farmer: DashRefDto;

  @ApiProperty()
  produceCode: string;

  @ApiProperty()
  districtCode: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-06-01' })
  startedOn: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-11-01' })
  plannedEndOn: string | null;

  @ApiProperty({ description: 'Past the planned end (Bangladesh calendar)' })
  overdue: boolean;

  @ApiProperty({ description: 'Funding raised' })
  raised: string;

  @ApiProperty({
    description: 'Approved voucher value, less cancelled balances',
  })
  inputsCommitted: string;

  @ApiProperty({ description: 'Confirmed input sales' })
  inputsSpent: string;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastFieldRecordAt: Date | null;

  @ApiProperty()
  openClaims: number;

  @ApiProperty()
  openListings: number;
}

export class ActiveDto {
  @ApiProperty()
  count: number;

  @ApiProperty({
    type: [ActiveProjectDto],
    description: 'Longest active first, up to 20',
  })
  projects: ActiveProjectDto[];
}

export class QueueItemDto {
  @ApiProperty({ description: 'The record id, for linking' })
  id: string;

  @ApiProperty({ example: 'Offer #12 on Maize Bogura' })
  title: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '2000 kg at 31.00',
  })
  detail: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: DashRefDto,
    description: 'Who it concerns',
  })
  person: DashRefDto | null;

  @ApiPropertyOptional({ nullable: true, type: DashRefDto })
  project: DashRefDto | null;

  @ApiProperty({ description: 'Waiting since (or due at, for deadlines)' })
  since: Date;

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      nullable: true,
    },
    example: { id: 12, quantity: '2000', produce: 'MAIZE', unitPrice: '31.00' },
    description:
      "The item's values, by queue key, for wording it in any language (money in taka)",
  })
  params: Record<string, string | number | boolean | null>;
}

export class QueueDto {
  @ApiProperty({ example: 'offers.pending' })
  key: string;

  @ApiProperty({ example: 'Offers awaiting approval' })
  title: string;

  @ApiProperty({ example: 'admin', description: 'Who acts on it' })
  actionBy: string;

  @ApiProperty()
  count: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { overdue: 2 },
    description: 'Urgent subsets: overdue, expiringSoon (24 h)',
  })
  urgent?: Record<string, number>;

  @ApiProperty({ type: [QueueItemDto], description: 'The 5 waiting longest' })
  oldest: QueueItemDto[];
}

export class FiguresDto {
  @ApiProperty({ description: 'Confirmed investments, all time' })
  fundingRaised: string;

  @ApiProperty({ description: 'Refunded on cancelled projects' })
  refunded: string;

  @ApiProperty({ description: 'Delivered sales' })
  salesIncome: string;

  @ApiProperty({ description: 'Approved insurance claims' })
  insuranceApproved: string;

  @ApiProperty({ description: 'Confirmed input sales' })
  inputsSpent: string;

  @ApiProperty({ description: 'Payout lines paid' })
  payoutsPaid: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { farmer: 120, investor: 340 },
    description: 'Verified participants by role',
  })
  participants: Record<string, number>;
}

export class TrendsDto {
  @ApiProperty({
    type: [String],
    example: ['2025-11', '2025-12'],
    description: 'Bangladesh calendar months',
  })
  months: string[];

  @ApiProperty({ type: [String] })
  fundingRaised: string[];

  @ApiProperty({ type: [String] })
  salesIncome: string[];

  @ApiProperty({ type: [String] })
  payoutsPaid: string[];

  @ApiProperty({ type: [Number] })
  projectsStarted: number[];

  @ApiProperty({ type: [Number] })
  projectsFinished: number[];
}

export class DashboardDto {
  @ApiProperty({
    description: "The ledger's time the live parts were computed at",
  })
  asOf: Date;

  @ApiProperty({ type: FundingDto })
  funding: FundingDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { draft: 2, open_for_funding: 3, active: 5 },
    description: 'Projects by stage',
  })
  stages: Record<string, number>;

  @ApiProperty({ type: ActiveDto })
  active: ActiveDto;

  @ApiProperty({
    type: [QueueDto],
    description: 'The queues your role acts on or oversees',
  })
  queues: QueueDto[];

  @ApiProperty({ type: FiguresDto })
  figures: FiguresDto;

  @ApiProperty({ type: TrendsDto, description: 'Last 12 months, oldest first' })
  trends: TrendsDto;

  @ApiProperty({
    description: 'When figures and trends were computed (cached up to 60 s)',
  })
  figuresAsOf: Date;
}
