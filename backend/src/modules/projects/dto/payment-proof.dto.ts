import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { SEARCH_MAX_LENGTH } from '../../users/person-search';
import { PaymentMethod, ProofStatus } from '../payment-proof.enums';
import { PersonRefDto } from './project-response.dto';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );
/** An empty multipart field means not given. */
const Blank = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  );

/** The fields sent with the files (multipart form). */
export class SubmitProofDto {
  @ApiProperty({
    example: '100000',
    description: 'Taka sent with this transfer',
  })
  @Matches(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/, {
    message: 'amount must be taka, e.g. "100000" or "100000.50"',
  })
  amount: string;

  @ApiProperty({ example: '2026-10-20' })
  @IsDateString({ strict: true })
  transferredOn: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    example: '200010074',
    description:
      'The branch paid from, by its routing number on the bank list (deposit or cheque); its bank and district come from the list',
  })
  @Blank()
  @IsOptional()
  @Matches(/^\d{9}$/, { message: 'routingNumber must be 9 digits' })
  routingNumber?: string;

  @ApiPropertyOptional({
    maxLength: 64,
    description: 'The transaction or cheque number',
  })
  @Blank()
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(64)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Blank()
  @IsOptional()
  @Text()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AcceptProofDto {
  @ApiProperty({
    example: 'UCB TRX 8F3K2 99120',
    description: 'The reference on the bank statement; used once',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  paymentReference: string;
}

export class RejectProofDto {
  @ApiProperty({ maxLength: 300, description: 'The investor reads this' })
  @Text()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class ProofRefundDto {
  @ApiProperty({ description: 'The reference of the transfer back' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  paymentReference: string;
}

export class ListProofsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProofStatus, enumName: 'ProofStatus' })
  @IsOptional()
  @IsEnum(ProofStatus)
  status?: ProofStatus;

  @ApiPropertyOptional({
    enum: ['due', 'refunded'],
    description: 'Money accepted for bookings that ended unconfirmed',
  })
  @IsOptional()
  @IsIn(['due', 'refunded'])
  refund?: 'due' | 'refunded';

  @ApiPropertyOptional({
    description: 'Whose: a mobile number, an NID, or whole words of their name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}

export class ProofFileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ example: '/api/payment-proofs/files/…' })
  url: string;
}

export class ProofDecisionDto {
  @ApiPropertyOptional({ nullable: true, type: PersonRefDto })
  by: PersonRefDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  at: Date | null;
}

export class PaymentProofDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  reservationId: number;

  @ApiProperty({ format: 'uuid' })
  projectId: string;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty({ type: PersonRefDto })
  investor: PersonRefDto;

  @ApiProperty({ example: '100000.00' })
  amount: string;

  @ApiProperty({
    example: '100000.00',
    description: 'What the booking costs in all',
  })
  reservationAmount: string;

  @ApiProperty({ enum: ['pending', 'confirmed', 'expired', 'cancelled'] })
  reservationStatus: string;

  @ApiProperty()
  transferredOn: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  method: PaymentMethod;

  @ApiPropertyOptional({ nullable: true, type: String })
  bankName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'The branch paid from (proofs before branches were asked: null)',
  })
  branchName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  districtName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '200010074' })
  routingNumber: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'As the investor typed it',
  })
  reference: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  note: string | null;

  @ApiProperty({ type: [ProofFileDto] })
  files: ProofFileDto[];

  @ApiProperty({ enum: ProofStatus, enumName: 'ProofStatus' })
  status: ProofStatus;

  @ApiProperty()
  submittedAt: Date;

  @ApiProperty({ type: ProofDecisionDto })
  decided: ProofDecisionDto;

  @ApiPropertyOptional({ nullable: true, type: String })
  rejectionReason: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'The statement reference Accounts verified (Accounts, admin and auditor only)',
  })
  verifiedReference?: string | null;

  @ApiProperty({
    enum: ['none', 'due', 'refunded'],
    description:
      'Accepted money for a booking that ended unconfirmed is refunded',
  })
  refund: 'none' | 'due' | 'refunded';

  @ApiPropertyOptional({ nullable: true, type: String })
  refundReference?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  refundedAt: Date | null;
}
