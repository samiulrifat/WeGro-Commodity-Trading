import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BatchStatus, SaleStatus, VoucherStatus } from '../voucher.enums';

export class RefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class InputRefDto {
  @ApiProperty({ example: 'UREA' })
  code: string;

  @ApiProperty({ example: 'Urea' })
  name: string;

  @ApiProperty({ example: 'ইউরিয়া' })
  nameBn: string;

  @ApiProperty({ example: 'kg' })
  unit: string;
}

export class BatchRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  lotNumber: string;
}

export class VoucherSaleDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ format: 'uuid' })
  voucherId: string;

  @ApiProperty({ type: RefDto })
  supplier: RefDto;

  @ApiProperty({ type: RefDto, description: "The voucher's farmer" })
  farmer: RefDto;

  @ApiProperty({ type: RefDto, description: "The voucher's project" })
  project: RefDto;

  @ApiProperty({ type: InputRefDto })
  input: InputRefDto;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ example: '1375.00' })
  amount: string;

  @ApiProperty({ enum: SaleStatus })
  status: SaleStatus;

  @ApiProperty()
  recordedAt: Date;

  @ApiProperty({
    description: "Must be confirmed by the farmer's field officer before this",
  })
  expiresAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  closedAt: Date | null;

  @ApiProperty({ type: [BatchRefDto] })
  batches: BatchRefDto[];
}

export class VoucherDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: RefDto })
  project: RefDto;

  @ApiProperty({ type: RefDto })
  farmer: RefDto;

  @ApiProperty({ type: InputRefDto })
  input: InputRefDto;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ example: '27.50' })
  unitPrice: string;

  @ApiProperty({ example: '4125.00' })
  value: string;

  @ApiProperty()
  spentQuantity: number;

  @ApiProperty()
  heldQuantity: number;

  @ApiProperty({ description: 'Usable now: zero unless the voucher is active' })
  availableQuantity: number;

  @ApiProperty({ example: '2750.00' })
  availableBalance: string;

  @ApiProperty({ enum: VoucherStatus })
  status: VoucherStatus;

  @ApiProperty({ type: [RefDto] })
  suppliers: RefDto[];

  @ApiPropertyOptional({ nullable: true, type: Date })
  proposedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastActivityAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  inactivityLimitDays: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description: 'When the inactivity limit was passed, if it was',
  })
  inactiveSince: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  voidedAmount: string | null;
}

export class VoucherDetailDto extends VoucherDto {
  @ApiProperty({ type: [VoucherSaleDto] })
  sales: VoucherSaleDto[];
}

export class VoucherSummaryDto {
  @ApiProperty({ example: '2000000.00' })
  fundingTarget: string;

  @ApiProperty({
    description:
      'Value of proposed and active vouchers, as the ledger counts it',
  })
  committed: string;

  @ApiProperty({ description: 'Still free for new vouchers' })
  room: string;

  @ApiProperty({
    description: "Confirmed input spending: the project's input cost",
  })
  spent: string;

  @ApiProperty({ description: 'In sales awaiting confirmation' })
  pendingSales: string;
}

export class BatchDto {
  @ApiProperty({ format: 'uuid', description: 'What the QR code encodes' })
  id: string;

  @ApiProperty({ type: RefDto })
  supplier: RefDto;

  @ApiProperty({ type: InputRefDto })
  input: InputRefDto;

  @ApiProperty()
  lotNumber: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  quantity: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  manufacturer: string | null;

  @ApiProperty({ example: '2026-09-01' })
  producedOn: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  expiresOn: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ enum: BatchStatus })
  status: BatchStatus;

  @ApiPropertyOptional({ nullable: true, type: Date })
  registeredAt: Date | null;

  @ApiProperty({ description: 'Link the QR code opens' })
  verifyUrl: string;
}

/** What anyone scanning a batch QR code sees. */
export class BatchVerificationDto {
  @ApiProperty({
    description: 'Registered on the ledger, and the details here match it',
  })
  genuine: boolean;

  @ApiPropertyOptional({ nullable: true, type: InputRefDto })
  product: InputRefDto | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lotNumber: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  manufacturer: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  producedOn: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  expiresOn: string | null;

  @ApiProperty()
  expired: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  supplierName: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  registeredAt: Date | null;
}
