import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  type OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type EntityTarget, QueryFailedError } from 'typeorm';
import {
  BD_DISTRICTS,
  DISTRICT_CODES,
} from '../../common/reference/bd-districts';
import { CodeList, type ListEntry } from './code-list';
import type {
  CreateFieldRecordTypeDto,
  CreateInputTypeDto,
  CreateProduceTypeDto,
  CreateUnitDto,
  CreateWeatherEventTypeDto,
  MeasurementDto,
  UpdateFieldRecordTypeDto,
  UpdateInputTypeDto,
  UpdateProduceTypeDto,
  UpdateUnitDto,
  UpdateWeatherEventTypeDto,
} from './dto/catalog-request.dto';
import type {
  CatalogDto,
  DistrictDto,
  FieldRecordTypeDto,
  InputTypeDto,
  ProduceTypeDto,
  UnitDto,
  WeatherEventTypeDto,
} from './dto/catalog-response.dto';
import {
  FieldRecordType,
  type MeasurementDefinition,
} from './entities/field-record-type.entity';
import { InputType } from './entities/input-type.entity';
import { ProduceType } from './entities/produce-type.entity';
import { Unit } from './entities/unit.entity';
import { WeatherEventType } from './entities/weather-event-type.entity';
import { ErrorCode } from '../../common/errors/error-code';

const DISTRICTS: readonly DistrictDto[] = Object.freeze(
  DISTRICT_CODES.map((code) =>
    Object.freeze({
      code,
      name: BD_DISTRICTS[code].name,
      division: BD_DISTRICTS[code].division,
    }),
  ),
);

/** Name uniqueness is case-insensitive, enforced by these indexes. */
const NAME_INDEXES = new Set([
  'uq_units_name',
  'uq_produce_types_name',
  'uq_input_types_name',
  'uq_field_record_types_name',
  'uq_weather_event_types_name',
]);

/**
 * The catalog: code lists behind every dropdown, and the source of truth for
 * which produce, input and record codes may be written to the ledger.
 *
 * Held in memory (a few hundred entries at most) and loaded at startup. Each
 * write goes to the database first and reaches the cache only once it
 * commits, so the cache never shows something the database refused. Lookups
 * used by other modules are a single map access.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  readonly units = new CodeList<UnitDto>('unit');
  readonly produceTypes = new CodeList<ProduceTypeDto>('produce type');
  readonly inputTypes = new CodeList<InputTypeDto>('input type');
  readonly fieldRecordTypes = new CodeList<FieldRecordTypeDto>(
    'field record type',
  );
  readonly weatherEventTypes = new CodeList<WeatherEventTypeDto>(
    'weather event type',
  );

  /** Built once per change, shared by every request until the next one. */
  private bundles: { active?: CatalogDto; all?: CatalogDto } = {};

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const m = this.dataSource.manager;
    const [units, produce, inputs, records, weather] = await Promise.all([
      m.find(Unit),
      m.find(ProduceType),
      m.find(InputType),
      m.find(FieldRecordType),
      m.find(WeatherEventType),
    ]);
    this.units.load(units.map(unitView));
    this.produceTypes.load(produce.map(produceView));
    this.inputTypes.load(inputs.map(inputView));
    this.fieldRecordTypes.load(records.map(recordTypeView));
    this.weatherEventTypes.load(weather.map(weatherView));
    this.bundles = {};
  }

  /** Every list plus the districts, and a version that is a hash of the content. */
  bundle(includeInactive = false): CatalogDto {
    const key = includeInactive ? 'all' : 'active';
    const cached = this.bundles[key];
    if (cached) return cached;
    const body = {
      units: this.units.list(includeInactive),
      produceTypes: this.produceTypes.list(includeInactive),
      inputTypes: this.inputTypes.list(includeInactive),
      fieldRecordTypes: this.fieldRecordTypes.list(includeInactive),
      weatherEventTypes: this.weatherEventTypes.list(includeInactive),
      districts: DISTRICTS,
    };
    const version = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('base64url')
      .slice(0, 22);
    const bundle = Object.freeze({ version, ...body }) as CatalogDto;
    this.bundles[key] = bundle;
    return bundle;
  }

  // --- Units ---

  async createUnit(dto: CreateUnitDto): Promise<UnitDto> {
    this.assertNew(this.units, dto.code);
    const row = await this.insert(Unit, {
      code: dto.code,
      name: dto.name,
      nameBn: dto.nameBn,
      sortOrder: dto.sortOrder ?? 0,
      kind: dto.kind,
      symbol: dto.symbol,
      symbolBn: dto.symbolBn,
    });
    return this.store(this.units, unitView(row));
  }

  async updateUnit(code: string, dto: UpdateUnitDto): Promise<UnitDto> {
    this.units.find(code);
    if (dto.active === false) {
      const users = [
        ...this.produceTypes.list().filter((p) => p.unitCode === code),
        ...this.inputTypes.list().filter((i) => i.unitCode === code),
      ].map((e) => e.code);
      if (users.length > 0) {
        throw new ConflictException({
          message: `Unit ${code} is used by active entries: ${users.join(', ')}`,
          code: ErrorCode.UNIT_IN_USE,
          details: { unit: code, entries: users.join(', ') },
        });
      }
    }
    const row = await this.update(Unit, code, {
      ...common(dto),
      ...(dto.symbol !== undefined && { symbol: dto.symbol }),
      ...(dto.symbolBn !== undefined && { symbolBn: dto.symbolBn }),
    });
    return this.store(this.units, unitView(row));
  }

  // --- Produce ---

  async createProduceType(dto: CreateProduceTypeDto): Promise<ProduceTypeDto> {
    this.assertNew(this.produceTypes, dto.code);
    this.units.requireActive(dto.unitCode);
    const row = await this.insert(ProduceType, {
      code: dto.code,
      name: dto.name,
      nameBn: dto.nameBn,
      sortOrder: dto.sortOrder ?? 0,
      category: dto.category,
      unitCode: dto.unitCode,
      typicalDurationMonths: dto.typicalDurationMonths ?? null,
      description: dto.description ?? null,
      descriptionBn: dto.descriptionBn ?? null,
    });
    return this.store(this.produceTypes, produceView(row));
  }

  async updateProduceType(
    code: string,
    dto: UpdateProduceTypeDto,
  ): Promise<ProduceTypeDto> {
    this.produceTypes.find(code);
    const row = await this.update(ProduceType, code, {
      ...common(dto),
      ...nullable(dto, [
        'typicalDurationMonths',
        'description',
        'descriptionBn',
      ]),
    });
    return this.store(this.produceTypes, produceView(row));
  }

  // --- Inputs ---

  async createInputType(dto: CreateInputTypeDto): Promise<InputTypeDto> {
    this.assertNew(this.inputTypes, dto.code);
    this.units.requireActive(dto.unitCode);
    if (dto.produceCode) this.produceTypes.requireActive(dto.produceCode);
    const row = await this.insert(InputType, {
      code: dto.code,
      name: dto.name,
      nameBn: dto.nameBn,
      sortOrder: dto.sortOrder ?? 0,
      kind: dto.kind,
      unitCode: dto.unitCode,
      produceCode: dto.produceCode ?? null,
      description: dto.description ?? null,
    });
    return this.store(this.inputTypes, inputView(row));
  }

  async updateInputType(
    code: string,
    dto: UpdateInputTypeDto,
  ): Promise<InputTypeDto> {
    this.inputTypes.find(code);
    const row = await this.update(InputType, code, {
      ...common(dto),
      ...nullable(dto, ['description']),
    });
    return this.store(this.inputTypes, inputView(row));
  }

  // --- Field record types ---

  async createFieldRecordType(
    dto: CreateFieldRecordTypeDto,
  ): Promise<FieldRecordTypeDto> {
    this.assertNew(this.fieldRecordTypes, dto.code);
    const row = await this.insert(FieldRecordType, {
      code: dto.code,
      name: dto.name,
      nameBn: dto.nameBn,
      sortOrder: dto.sortOrder ?? 0,
      requiresPhoto: dto.requiresPhoto ?? false,
      requiresLocation: dto.requiresLocation ?? true,
      measurements: checkMeasurements(dto.measurements ?? []),
    });
    return this.store(this.fieldRecordTypes, recordTypeView(row));
  }

  async updateFieldRecordType(
    code: string,
    dto: UpdateFieldRecordTypeDto,
  ): Promise<FieldRecordTypeDto> {
    this.fieldRecordTypes.find(code);
    const row = await this.update(FieldRecordType, code, {
      ...common(dto),
      ...(dto.requiresPhoto !== undefined && {
        requiresPhoto: dto.requiresPhoto,
      }),
      ...(dto.requiresLocation !== undefined && {
        requiresLocation: dto.requiresLocation,
      }),
      ...(dto.measurements !== undefined && {
        measurements: checkMeasurements(dto.measurements),
      }),
    });
    return this.store(this.fieldRecordTypes, recordTypeView(row));
  }

  // --- Weather events ---

  async createWeatherEventType(
    dto: CreateWeatherEventTypeDto,
  ): Promise<WeatherEventTypeDto> {
    this.assertNew(this.weatherEventTypes, dto.code);
    const row = await this.insert(WeatherEventType, {
      code: dto.code,
      name: dto.name,
      nameBn: dto.nameBn,
      sortOrder: dto.sortOrder ?? 0,
      description: dto.description ?? null,
    });
    return this.store(this.weatherEventTypes, weatherView(row));
  }

  async updateWeatherEventType(
    code: string,
    dto: UpdateWeatherEventTypeDto,
  ): Promise<WeatherEventTypeDto> {
    this.weatherEventTypes.find(code);
    const row = await this.update(WeatherEventType, code, {
      ...common(dto),
      ...nullable(dto, ['description']),
    });
    return this.store(this.weatherEventTypes, weatherView(row));
  }

  // --- Helpers ---

  private assertNew(list: CodeList<ListEntry>, code: string): void {
    if (list.has(code)) {
      throw new ConflictException({
        message: `The ${list.label} code ${code} already exists`,
        code: ErrorCode.CATALOG_CODE_EXISTS,
        details: { code },
      });
    }
  }

  private store<T extends ListEntry>(list: CodeList<T>, view: T): T {
    list.put(view);
    this.bundles = {};
    return view;
  }

  private async insert<E extends object>(
    target: EntityTarget<E>,
    values: Partial<E>,
  ): Promise<E> {
    const repo = this.dataSource.getRepository(target);
    try {
      return await repo.save(repo.create(values as E));
    } catch (error) {
      throw mapUniqueViolation(error);
    }
  }

  private async update<E extends { code: string }>(
    target: EntityTarget<E>,
    code: string,
    patch: Record<string, unknown>,
  ): Promise<E> {
    const repo = this.dataSource.getRepository(target);
    try {
      if (Object.keys(patch).length > 0) {
        await repo.update({ code } as never, patch as never);
      }
    } catch (error) {
      throw mapUniqueViolation(error);
    }
    return repo.findOneByOrFail({ code } as never);
  }
}

// --- Views: what the API returns and the cache holds ---

const base = (e: ListEntry & { nameBn: string }) => ({
  code: e.code,
  name: e.name,
  nameBn: e.nameBn,
  active: e.active,
  sortOrder: e.sortOrder,
});

const unitView = (u: Unit): UnitDto => ({
  ...base(u),
  kind: u.kind,
  symbol: u.symbol,
  symbolBn: u.symbolBn,
});

const produceView = (p: ProduceType): ProduceTypeDto => ({
  ...base(p),
  category: p.category,
  unitCode: p.unitCode,
  typicalDurationMonths: p.typicalDurationMonths,
  description: p.description,
  descriptionBn: p.descriptionBn,
});

const inputView = (i: InputType): InputTypeDto => ({
  ...base(i),
  kind: i.kind,
  unitCode: i.unitCode,
  produceCode: i.produceCode,
  description: i.description,
});

const recordTypeView = (r: FieldRecordType): FieldRecordTypeDto => ({
  ...base(r),
  requiresPhoto: r.requiresPhoto,
  requiresLocation: r.requiresLocation,
  measurements: r.measurements,
});

const weatherView = (w: WeatherEventType): WeatherEventTypeDto => ({
  ...base(w),
  description: w.description,
});

/** Fields every list can update. */
function common(dto: {
  name?: string;
  nameBn?: string;
  sortOrder?: number;
  active?: boolean;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'nameBn', 'sortOrder', 'active'] as const) {
    if (dto[key] !== undefined) patch[key] = dto[key];
  }
  return patch;
}

/** Optional fields where null clears the value and undefined leaves it. */
function nullable<T extends object>(
  dto: T,
  keys: (keyof T)[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (dto[key] !== undefined) patch[key as string] = dto[key] ?? null;
  }
  return patch;
}

/**
 * Measurement definitions must be internally consistent: unique keys, a range
 * that is not inverted, and bounds that fit the allowed decimal places.
 */
export function checkMeasurements(
  list: MeasurementDto[],
): MeasurementDefinition[] {
  const seen = new Set<string>();
  return list.map((m) => {
    if (seen.has(m.key)) {
      throw new UnprocessableEntityException({
        message: `Measurement key ${m.key} is used twice`,
        code: ErrorCode.MEASUREMENT_KEY_REPEATED,
        details: { key: m.key },
      });
    }
    seen.add(m.key);
    const min = m.min ?? null;
    const max = m.max ?? null;
    if (min !== null && max !== null && min > max) {
      throw new UnprocessableEntityException({
        message: `Measurement ${m.key}: min is above max`,
        code: ErrorCode.MEASUREMENT_RANGE_INVALID,
        details: { key: m.key },
      });
    }
    for (const bound of [min, max]) {
      if (bound !== null && decimalPlaces(bound) > m.decimals) {
        throw new UnprocessableEntityException({
          message: `Measurement ${m.key}: bound ${bound} has more than ${m.decimals} decimal places`,
          code: ErrorCode.MEASUREMENT_BOUND_DECIMALS,
          details: { key: m.key, bound, decimals: m.decimals },
        });
      }
    }
    return {
      key: m.key,
      label: m.label,
      labelBn: m.labelBn,
      unit: m.unit ?? null,
      min,
      max,
      decimals: m.decimals,
      required: m.required,
    };
  });
}

/** Decimal places of a finite number as written, e.g. 2.50 -> 1, 1e-3 -> 3. */
export function decimalPlaces(n: number): number {
  const [mantissa, exponent] = n.toString().toLowerCase().split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent ?? 0));
}

function mapUniqueViolation(error: unknown): unknown {
  if (error instanceof QueryFailedError) {
    const driver = error.driverError as { code?: string; constraint?: string };
    if (driver.code === '23505') {
      return new ConflictException(
        driver.constraint && NAME_INDEXES.has(driver.constraint)
          ? {
              message: 'An entry with this name already exists',
              code: ErrorCode.CATALOG_NAME_EXISTS,
            }
          : {
              message: 'An entry with this code already exists',
              code: ErrorCode.CATALOG_CODE_EXISTS,
            },
      );
    }
    if (driver.code === '23503') {
      return new UnprocessableEntityException({
        message: 'A referenced code does not exist',
        code: ErrorCode.CATALOG_REFERENCE_UNKNOWN,
      });
    }
  }
  return error;
}
