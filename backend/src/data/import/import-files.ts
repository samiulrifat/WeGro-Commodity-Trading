import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DISTRICT_CODES } from '../../common/reference/bd-districts';
import { CODE_PATTERN } from '../../modules/catalog/catalog.enums';
import {
  CreateFieldRecordTypeDto,
  CreateInputTypeDto,
  CreateProduceTypeDto,
  CreateUnitDto,
  CreateWeatherEventTypeDto,
} from '../../modules/catalog/dto/catalog-request.dto';
import { RegisterParticipantDto } from '../../modules/participants/dto/participant-request.dto';
import { CreateProjectDto } from '../../modules/projects/dto/project-request.dto';

const TAKA = /^(0|[1-9]\d{0,13})(\.\d{1,2})?$/;
const QUANTITY = /^(0|[1-9]\d{0,10})(\.\d{1,3})?$/;

/** What a cell becomes before validation. */
export type Cell = 'text' | 'int' | 'bool' | 'json';

export interface ImportFile {
  /** CSV file name in the import folder. */
  file: string;
  /** Kind recorded in import_records. */
  kind: string;
  /** The column holding WeGro's id for the row. */
  idColumn: string;
  /** CSV column -> [DTO field, cell type]. */
  columns: Record<string, [string, Cell]>;
  /** Columns that must be present and non-empty. */
  required: string[];
  /** The class the row is validated as (the API's own DTO where there is one). */
  dto: new () => object;
  /** Columns naming another imported record: column -> kind. */
  refs?: Record<string, string>;
}

// --- Rows without an API DTO -----------------------------------------------

/** People: the API's registration fields plus the import's own. */
export class PersonRow extends RegisterParticipantDto {
  @IsOptional()
  @IsString()
  fieldOfficerId?: string;

  @IsOptional()
  @IsBoolean()
  acknowledgeFlags?: boolean;
}

export const PROJECT_STAGES = ['draft', 'open_for_funding', 'active'] as const;

/** Projects: the API's fields plus the stage to bring the project to. */
export class ProjectRow extends CreateProjectDto {
  @IsOptional()
  @IsIn(PROJECT_STAGES)
  stage?: (typeof PROJECT_STAGES)[number];
}

export class InvestmentRow {
  @IsString()
  projectId: string;

  @IsString()
  investorId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  slots: number;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  paymentReference: string;
}

export class HistoryRow {
  @IsString()
  farmerId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @Matches(CODE_PATTERN)
  produceCode: string;

  @IsIn(DISTRICT_CODES)
  districtCode: string;

  @IsDateString({ strict: true })
  startedOn: string;

  @IsDateString({ strict: true })
  finishedOn: string;

  @Matches(TAKA, { message: '$property must be taka, e.g. "200000.00"' })
  fundingRaised: string;

  @Matches(TAKA, { message: '$property must be taka' })
  income: string;

  @Matches(TAKA, { message: '$property must be taka' })
  costs: string;

  @Matches(TAKA, { message: '$property must be taka' })
  farmerReceived: string;

  @IsOptional()
  @Matches(QUANTITY, {
    message: '$property must be a quantity, up to 3 decimals',
  })
  harvested?: string;

  @IsOptional()
  @Matches(QUANTITY, {
    message: '$property must be a quantity, up to 3 decimals',
  })
  sold?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

// --- The files, in the order they are applied -------------------------------

const entry = {
  code: ['code', 'text'],
  name: ['name', 'text'],
  name_bn: ['nameBn', 'text'],
  sort_order: ['sortOrder', 'int'],
} satisfies Record<string, [string, Cell]>;

export const IMPORT_FILES: ImportFile[] = [
  {
    file: 'units.csv',
    kind: 'unit',
    idColumn: 'code',
    columns: { ...entry, kind: ['kind', 'text'], symbol: ['symbol', 'text'] },
    required: ['code', 'name', 'name_bn', 'kind', 'symbol'],
    dto: CreateUnitDto,
  },
  {
    file: 'produce-types.csv',
    kind: 'produce-type',
    idColumn: 'code',
    columns: {
      ...entry,
      category: ['category', 'text'],
      unit_code: ['unitCode', 'text'],
      typical_duration_months: ['typicalDurationMonths', 'int'],
      description: ['description', 'text'],
      description_bn: ['descriptionBn', 'text'],
    },
    required: ['code', 'name', 'name_bn', 'category', 'unit_code'],
    dto: CreateProduceTypeDto,
  },
  {
    file: 'input-types.csv',
    kind: 'input-type',
    idColumn: 'code',
    columns: {
      ...entry,
      kind: ['kind', 'text'],
      unit_code: ['unitCode', 'text'],
      produce_code: ['produceCode', 'text'],
      description: ['description', 'text'],
    },
    required: ['code', 'name', 'name_bn', 'kind', 'unit_code'],
    dto: CreateInputTypeDto,
  },
  {
    file: 'field-record-types.csv',
    kind: 'record-type',
    idColumn: 'code',
    columns: {
      ...entry,
      requires_photo: ['requiresPhoto', 'bool'],
      requires_location: ['requiresLocation', 'bool'],
      measurements: ['measurements', 'json'],
    },
    required: ['code', 'name', 'name_bn'],
    dto: CreateFieldRecordTypeDto,
  },
  {
    file: 'weather-event-types.csv',
    kind: 'weather-type',
    idColumn: 'code',
    columns: { ...entry, description: ['description', 'text'] },
    required: ['code', 'name', 'name_bn'],
    dto: CreateWeatherEventTypeDto,
  },
  {
    file: 'people.csv',
    kind: 'person',
    idColumn: 'id',
    columns: {
      id: ['id', 'text'],
      role: ['role', 'text'],
      full_name: ['fullName', 'text'],
      phone: ['phone', 'text'],
      nid: ['nid', 'text'],
      date_of_birth: ['dateOfBirth', 'text'],
      district: ['district', 'text'],
      address: ['address', 'text'],
      field_officer_id: ['fieldOfficerId', 'text'],
      acknowledge_flags: ['acknowledgeFlags', 'bool'],
    },
    required: [
      'id',
      'role',
      'full_name',
      'phone',
      'nid',
      'date_of_birth',
      'district',
      'address',
    ],
    dto: PersonRow,
    refs: { field_officer_id: 'person' },
  },
  {
    file: 'projects.csv',
    kind: 'project',
    idColumn: 'id',
    columns: {
      id: ['id', 'text'],
      title: ['title', 'text'],
      description: ['description', 'text'],
      produce_code: ['produceCode', 'text'],
      district: ['districtCode', 'text'],
      location: ['location', 'text'],
      farmer_id: ['farmerId', 'text'],
      duration_type: ['durationType', 'text'],
      duration_months: ['durationMonths', 'int'],
      payout_interval_months: ['payoutIntervalMonths', 'int'],
      funding_target: ['fundingTarget', 'text'],
      slot_price: ['slotPrice', 'text'],
      farmer_bps: ['farmerBps', 'int'],
      investor_bps: ['investorBps', 'int'],
      wegro_bps: ['wegroBps', 'int'],
      insured: ['insured', 'bool'],
      estimated_return_min_bps: ['estimatedReturnMinBps', 'int'],
      estimated_return_max_bps: ['estimatedReturnMaxBps', 'int'],
      planned_start_date: ['plannedStartDate', 'text'],
      stage: ['stage', 'text'],
    },
    required: [
      'id',
      'title',
      'produce_code',
      'district',
      'location',
      'farmer_id',
      'duration_type',
      'duration_months',
      'funding_target',
      'slot_price',
      'estimated_return_min_bps',
      'estimated_return_max_bps',
    ],
    dto: ProjectRow,
    refs: { farmer_id: 'person' },
  },
  {
    file: 'investments.csv',
    kind: 'investment',
    idColumn: 'id',
    columns: {
      id: ['id', 'text'],
      project_id: ['projectId', 'text'],
      investor_id: ['investorId', 'text'],
      slots: ['slots', 'int'],
      payment_reference: ['paymentReference', 'text'],
    },
    required: ['id', 'project_id', 'investor_id', 'slots', 'payment_reference'],
    dto: InvestmentRow,
    refs: { project_id: 'project', investor_id: 'person' },
  },
  {
    file: 'history.csv',
    kind: 'history',
    idColumn: 'id',
    columns: {
      id: ['id', 'text'],
      farmer_id: ['farmerId', 'text'],
      title: ['title', 'text'],
      produce_code: ['produceCode', 'text'],
      district: ['districtCode', 'text'],
      started_on: ['startedOn', 'text'],
      finished_on: ['finishedOn', 'text'],
      funding_raised: ['fundingRaised', 'text'],
      income: ['income', 'text'],
      costs: ['costs', 'text'],
      farmer_received: ['farmerReceived', 'text'],
      harvested: ['harvested', 'text'],
      sold: ['sold', 'text'],
      notes: ['notes', 'text'],
    },
    required: [
      'id',
      'farmer_id',
      'title',
      'produce_code',
      'district',
      'started_on',
      'finished_on',
      'funding_raised',
      'income',
      'costs',
      'farmer_received',
    ],
    dto: HistoryRow,
    refs: { farmer_id: 'person' },
  },
];
