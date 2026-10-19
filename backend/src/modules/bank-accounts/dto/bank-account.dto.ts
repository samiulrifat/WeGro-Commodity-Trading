import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { SEARCH_MAX_LENGTH } from '../../users/person-search';
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

/**
 * What the payee or an admin enters. The branch is picked from the bank
 * list (bank, district, branch); its routing number names it, and the
 * bank, branch and district names are taken from the list.
 */
export class BankDetailsDto {
  @ApiProperty({
    example: 'Rahima Begum',
    maxLength: 100,
    description: 'The name on the account, as the bank has it',
  })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  holderName: string;

  @ApiProperty({ example: '0123456789012', description: '6 to 20 digits' })
  @Digits()
  @Matches(/^\d{6,20}$/, { message: 'accountNumber must be 6 to 20 digits' })
  accountNumber: string;

  @ApiProperty({
    example: '200100123',
    description: "The branch's 9-digit routing number, from the bank list",
  })
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

export class ListPendingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Whose: a mobile number, an NID, or whole words of their name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}

class BankPartyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class BankAccountDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Rahima Begum' })
  holderName: string;

  @ApiProperty({ example: 'SONALI BANK LTD.' })
  bankName: string;

  @ApiProperty({ example: 'BOGRA' })
  branchName: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'BOGRA',
    description:
      "The branch's district (null for details entered before the bank list)",
  })
  districtName: string | null;

  @ApiProperty({
    example: '0123456789012',
    description:
      'In full for admins, Accounts and the payee; others see the last four digits',
  })
  accountNumber: string;

  @ApiProperty({ example: '200100123' })
  routingNumber: string;

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
