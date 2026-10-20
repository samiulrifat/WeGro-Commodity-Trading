import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const Text = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  );
const Digits = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  );

export class CreatePaymentAccountDto {
  @ApiProperty({
    example: '245264485',
    description: 'The branch, by its routing number on the bank list',
  })
  @Digits()
  @Matches(/^\d{9}$/, { message: 'routingNumber must be 9 digits' })
  routingNumber: string;

  @ApiProperty({ example: 'WEGRO TECHNOLOGIES LTD', maxLength: 100 })
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  accountName: string;

  @ApiProperty({ example: '1042112000000463', description: '6 to 20 digits' })
  @Digits()
  @Matches(/^\d{6,20}$/, { message: 'accountNumber must be 6 to 20 digits' })
  accountNumber: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

/** Omitted fields stay as they are. */
export class UpdatePaymentAccountDto {
  @ApiPropertyOptional({ description: 'Another branch, by routing number' })
  @IsOptional()
  @Digits()
  @Matches(/^\d{9}$/, { message: 'routingNumber must be 9 digits' })
  routingNumber?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Text()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  accountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Digits()
  @Matches(/^\d{6,20}$/, { message: 'accountNumber must be 6 to 20 digits' })
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'false retires it: investors no longer see it',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PaymentAccountDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'UNITED COMMERCIAL BANK LTD.' })
  bankName: string;

  @ApiProperty({ example: 'TEJGAON' })
  branchName: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  districtName: string | null;

  @ApiProperty({ example: '245264485' })
  routingNumber: string;

  @ApiProperty()
  accountName: string;

  @ApiProperty()
  accountNumber: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  updatedAt: Date;
}
