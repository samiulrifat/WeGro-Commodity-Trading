import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { BankAccountStatus } from '../entities/bank-account.entity';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );
/** Spaces and hyphens people type in account numbers are dropped. */
const Digits = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  );

export class BankDetailsDto {
  @ApiProperty({ example: 'Rahima Begum', maxLength: 100 })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  holderName: string;

  @ApiProperty({ example: 'Sonali Bank PLC', maxLength: 100 })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ example: 'Bogura Main Branch', maxLength: 100 })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  branchName: string;

  @ApiProperty({ example: '0123456789012', description: '6 to 20 digits' })
  @Digits()
  @Matches(/^\d{6,20}$/, { message: 'accountNumber must be 6 to 20 digits' })
  accountNumber: string;

  @ApiProperty({ example: '200100123', description: '9-digit routing number' })
  @Digits()
  @Matches(/^\d{9}$/, { message: 'routingNumber must be 9 digits' })
  routingNumber: string;
}

export class RejectBankAccountDto {
  @ApiProperty({ maxLength: 500 })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

export class ListPendingQueryDto extends PaginationQueryDto {}

class BankPartyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class BankAccountDto extends BankDetailsDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: BankAccountStatus })
  status: BankAccountStatus;

  @ApiProperty({ type: BankPartyDto })
  enteredBy: BankPartyDto;

  @ApiProperty()
  enteredAt: Date;

  @ApiPropertyOptional({ nullable: true, type: BankPartyDto })
  decidedBy: BankPartyDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  decidedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  rejectionReason: string | null;
}

export class BankAccountsDto {
  @ApiPropertyOptional({
    nullable: true,
    type: BankAccountDto,
    description: 'Where payouts go',
  })
  verified: BankAccountDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: BankAccountDto,
    description: 'Waiting for an admin',
  })
  pending: BankAccountDto | null;

  @ApiProperty({
    type: [BankAccountDto],
    description: 'Older versions, newest first',
  })
  history: BankAccountDto[];
}

export class PendingBankAccountDto extends BankAccountDto {
  @ApiProperty({ type: BankPartyDto })
  owner: BankPartyDto;

  @ApiProperty({ enum: ['farmer', 'investor'] })
  ownerRole: string;

  @ApiProperty({ description: 'Replaces verified details' })
  isChange: boolean;
}
