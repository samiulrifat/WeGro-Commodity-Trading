import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProofDecisionDto,
  ProofFileDto,
} from '../../projects/dto/payment-proof.dto';
import {
  PersonRefDto,
  ProduceRefDto,
} from '../../projects/dto/project-response.dto';
import { PaymentMethod, ProofStatus } from '../../projects/payment-proof.enums';
import { OfferStatus } from '../trade.enums';

/** A buyer's proof of payment for a deal, as the buyer and payment staff see it. */
export class DealProofDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  offerId: number;

  @ApiProperty({ type: ProduceRefDto })
  produce: ProduceRefDto;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ type: PersonRefDto })
  buyer: PersonRefDto;

  @ApiProperty({ example: '100000.00' })
  amount: string;

  @ApiProperty({
    example: '100250.00',
    description: 'What the buyer pays in all: the deal amount and the fee',
  })
  dealTotal: string;

  @ApiProperty({ enum: OfferStatus })
  dealStatus: OfferStatus;

  @ApiProperty()
  transferredOn: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  method: PaymentMethod;

  @ApiPropertyOptional({ nullable: true, type: String })
  bankName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  branchName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  districtName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '200010074' })
  routingNumber: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'As the buyer typed it',
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
    description: 'Accepted money for a deal that ended unpaid is refunded',
  })
  refund: 'none' | 'due' | 'refunded';

  @ApiPropertyOptional({ nullable: true, type: String })
  refundReference?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  refundedAt: Date | null;
}
