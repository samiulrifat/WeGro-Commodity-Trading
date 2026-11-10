import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  ProofDecisionDto,
  ProofFileDto,
} from '../../projects/dto/payment-proof.dto';
import { PersonRefDto } from '../../projects/dto/project-response.dto';
import { PaymentMethod, ProofStatus } from '../../projects/payment-proof.enums';
import { SEARCH_MAX_LENGTH } from '../../users/person-search';
import { ClaimStatus } from '../insurance.enums';
import { PartyDto } from './insurance.dto';

export class ListClaimProofsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProofStatus, enumName: 'ProofStatus' })
  @IsOptional()
  @IsEnum(ProofStatus)
  status?: ProofStatus;

  @ApiPropertyOptional({
    description:
      'Whose: the insurer’s mobile number, NID, or whole words of their name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}

/** An insurer's proof of payment for a claim, as the insurer and payment staff see it. */
export class ClaimProofDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  claimId: string;

  @ApiProperty({ type: PartyDto })
  project: PartyDto;

  @ApiProperty({ type: PersonRefDto })
  insurer: PersonRefDto;

  @ApiProperty({ example: '100000.00' })
  amount: string;

  @ApiProperty({
    example: '120000.00',
    description: 'What the insurer pays in all: the approved amount',
  })
  claimTotal: string;

  @ApiProperty({ enum: ClaimStatus })
  claimStatus: ClaimStatus;

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
    description: 'As the insurer typed it',
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
}
