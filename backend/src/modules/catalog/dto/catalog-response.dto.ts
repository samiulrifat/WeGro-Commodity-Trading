import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InputKind, ProduceCategory, UnitKind } from '../catalog.enums';
import type { MeasurementDefinition } from '../entities/field-record-type.entity';
import { MeasurementDto } from './catalog-request.dto';

class EntryDto {
  @ApiProperty({ example: 'MAIZE' })
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  nameBn: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  sortOrder: number;
}

export class UnitDto extends EntryDto {
  @ApiProperty({ enum: UnitKind })
  kind: UnitKind;

  @ApiProperty({ example: 'kg' })
  symbol: string;
}

export class ProduceTypeDto extends EntryDto {
  @ApiProperty({ enum: ProduceCategory })
  category: ProduceCategory;

  @ApiProperty({ example: 'KG' })
  unitCode: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  typicalDurationMonths: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  descriptionBn: string | null;
}

export class InputTypeDto extends EntryDto {
  @ApiProperty({ enum: InputKind })
  kind: InputKind;

  @ApiProperty({ example: 'KG' })
  unitCode: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  produceCode: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;
}

export class FieldRecordTypeDto extends EntryDto {
  @ApiProperty()
  requiresPhoto: boolean;

  @ApiProperty()
  requiresLocation: boolean;

  @ApiProperty({ type: [MeasurementDto] })
  measurements: MeasurementDefinition[];
}

export class WeatherEventTypeDto extends EntryDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;
}

export class DistrictDto {
  @ApiProperty({ example: 'BOGURA' })
  code: string;

  @ApiProperty({ example: 'Bogura' })
  name: string;

  @ApiProperty({ example: 'Rajshahi' })
  division: string;
}

/** Everything the app's dropdowns need, in one response. */
export class CatalogDto {
  @ApiProperty({
    description: 'Changes whenever any entry changes; also sent as the ETag',
  })
  version: string;

  @ApiProperty({ type: [UnitDto] })
  units: UnitDto[];

  @ApiProperty({ type: [ProduceTypeDto] })
  produceTypes: ProduceTypeDto[];

  @ApiProperty({ type: [InputTypeDto] })
  inputTypes: InputTypeDto[];

  @ApiProperty({ type: [FieldRecordTypeDto] })
  fieldRecordTypes: FieldRecordTypeDto[];

  @ApiProperty({ type: [WeatherEventTypeDto] })
  weatherEventTypes: WeatherEventTypeDto[];

  @ApiProperty({ type: [DistrictDto] })
  districts: DistrictDto[];
}
