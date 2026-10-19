import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BankListSource } from '../entities/bank-list-import.entity';

export class ListedBankDto {
  @ApiProperty({ example: 200, description: 'Clearing code' })
  code: number;

  @ApiProperty({ example: 'SONALI BANK LTD.' })
  name: string;
}

export class ListedDistrictDto {
  @ApiProperty({ example: 610 })
  code: number;

  @ApiProperty({ example: 'BOGRA' })
  name: string;
}

export class ListedBranchDto {
  @ApiProperty({ example: '200100123', description: '9 digits' })
  routingNumber: string;

  @ApiProperty({ example: 'BOGRA' })
  name: string;
}

export class BranchDto extends ListedBranchDto {
  @ApiProperty({ description: "The branch's number within its bank" })
  branchCode: number;

  @ApiProperty({ type: ListedBankDto })
  bank: ListedBankDto;

  @ApiProperty({ type: ListedDistrictDto })
  district: ListedDistrictDto;
}

class ImporterDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class BankListStatusDto {
  @ApiProperty()
  bankCount: number;

  @ApiProperty()
  districtCount: number;

  @ApiProperty()
  branchCount: number;

  @ApiPropertyOptional({ nullable: true, type: Date })
  importedAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: ImporterDto,
    description: 'Null for the list that comes with the platform',
  })
  importedBy: ImporterDto | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: BankListSource,
    enumName: 'BankListSource',
  })
  source: BankListSource | null;
}
