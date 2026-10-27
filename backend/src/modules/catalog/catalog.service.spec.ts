import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CatalogService } from './catalog.service';
import { FieldRecordType } from './entities/field-record-type.entity';
import { InputType } from './entities/input-type.entity';
import { ProduceType } from './entities/produce-type.entity';
import { Unit } from './entities/unit.entity';
import { WeatherEventType } from './entities/weather-event-type.entity';

const dbError = (code: string, constraint?: string) =>
  new QueryFailedError('q', [], { code, constraint } as unknown as Error);

/** One in-memory table per catalog entity; `refuse` makes the next write fail. */
function database(seed: Partial<Record<string, object[]>> = {}) {
  const tables = new Map<unknown, Array<Record<string, unknown>>>([
    [Unit, (seed.units ?? []) as never],
    [ProduceType, (seed.produce ?? []) as never],
    [InputType, []],
    [FieldRecordType, []],
    [WeatherEventType, []],
  ]);
  let refusal: Error | null = null;
  const repo = (entity: unknown) => {
    const rows = tables.get(entity)!;
    return {
      create: (v: object) => ({ active: true, sortOrder: 0, ...v }),
      save: (v: Record<string, unknown>) => {
        if (refusal) {
          const e = refusal;
          refusal = null;
          return Promise.reject(e);
        }
        rows.push(v);
        return Promise.resolve(v);
      },
      update: ({ code }: { code: string }, patch: object) => {
        if (refusal) {
          const e = refusal;
          refusal = null;
          return Promise.reject(e);
        }
        Object.assign(
          rows.find((r) => r.code === code)!,
          patch,
        );
        return Promise.resolve({ affected: 1 });
      },
      findOneByOrFail: ({ code }: { code: string }) =>
        Promise.resolve(rows.find((r) => r.code === code)),
    };
  };
  const dataSource = {
    manager: { find: (entity: unknown) => Promise.resolve(tables.get(entity)) },
    getRepository: repo,
  };
  return { dataSource, tables, refuse: (e: Error) => (refusal = e) };
}

const kg = {
  code: 'KG',
  name: 'Kilogram',
  nameBn: 'কেজি',
  active: true,
  sortOrder: 0,
  kind: 'weight',
  symbol: 'kg',
  symbolBn: 'কেজি',
};
const maize = {
  code: 'MAIZE',
  name: 'Maize',
  nameBn: 'ভুট্টা',
  active: true,
  sortOrder: 0,
  category: 'grain',
  unitCode: 'KG',
  typicalDurationMonths: 5,
  description: null,
  descriptionBn: null,
};

describe('CatalogService', () => {
  const build = async (seed?: Parameters<typeof database>[0]) => {
    const db = database(seed ?? { units: [kg], produce: [maize] });
    const service = new CatalogService(db.dataSource as never);
    await service.onModuleInit();
    return { service, ...db };
  };

  it('loads every list at startup and serves lookups from memory', async () => {
    const { service } = await build();
    expect(service.units.get('KG')).toMatchObject({
      symbol: 'kg',
      symbolBn: 'কেজি',
    });
    expect(service.produceTypes.requireActive('MAIZE').unitCode).toBe('KG');
  });

  it('builds the bundle once, and versions it by content', async () => {
    const { service } = await build();
    const first = service.bundle();
    expect(service.bundle()).toBe(first);
    expect(first.districts.length).toBe(64);
    await service.createWeatherEventType({
      code: 'FLOOD',
      name: 'Flood',
      nameBn: 'বন্যা',
    } as never);
    const next = service.bundle();
    expect(next).not.toBe(first);
    expect(next.version).not.toBe(first.version);
    expect(next.weatherEventTypes.map((w) => w.code)).toEqual(['FLOOD']);
  });

  it('refuses a code that exists, without asking the database', async () => {
    const { service, tables } = await build();
    await expect(service.createUnit({ ...kg } as never)).rejects.toThrow(
      'The unit code KG already exists',
    );
    expect(tables.get(Unit)).toHaveLength(1);
  });

  it('updates the cache only once the database has accepted the write', async () => {
    const { service, refuse } = await build();
    refuse(dbError('23505', 'uq_produce_types_name'));
    await expect(
      service.createProduceType({
        code: 'WHEAT',
        name: 'Maize',
        nameBn: 'x',
        category: 'grain',
        unitCode: 'KG',
      } as never),
    ).rejects.toThrow(
      new ConflictException('An entry with this name already exists'),
    );
    expect(service.produceTypes.has('WHEAT')).toBe(false);
  });

  it('turns a missing reference into a 422 and a code clash into a 409', async () => {
    const { service, refuse } = await build();
    refuse(dbError('23503'));
    await expect(
      service.updateProduceType('MAIZE', { name: 'Corn' } as never),
    ).rejects.toThrow(UnprocessableEntityException);
    refuse(dbError('23505', 'pk_units'));
    await expect(
      service.createUnit({ ...kg, code: 'TON', name: 'Ton' } as never),
    ).rejects.toThrow('An entry with this code already exists');
  });

  it('needs an active unit for new produce and inputs, and an active crop for crop inputs', async () => {
    const { service } = await build();
    await expect(
      service.createProduceType({
        code: 'RICE',
        name: 'Rice',
        nameBn: 'x',
        category: 'grain',
        unitCode: 'LITRE',
      } as never),
    ).rejects.toThrow('Unknown unit LITRE');
    await expect(
      service.createInputType({
        code: 'SEED_X',
        name: 'Seed',
        nameBn: 'x',
        kind: 'seed',
        unitCode: 'KG',
        produceCode: 'NOPE',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('will not retire a unit active entries still use', async () => {
    const { service } = await build();
    await expect(
      service.updateUnit('KG', { active: false } as never),
    ).rejects.toThrow('Unit KG is used by active entries: MAIZE');
  });

  it('clears an optional field with null and leaves it alone when omitted', async () => {
    const { service, tables } = await build();
    await service.updateProduceType('MAIZE', {
      description: 'Hybrid',
    } as never);
    await service.updateProduceType('MAIZE', { name: 'Corn' } as never);
    expect(tables.get(ProduceType)![0]).toMatchObject({
      name: 'Corn',
      description: 'Hybrid',
    });
    await service.updateProduceType('MAIZE', { description: null } as never);
    expect(service.produceTypes.get('MAIZE')!.description).toBeNull();
  });

  it('checks measurement definitions on record types', async () => {
    const { service } = await build();
    await expect(
      service.createFieldRecordType({
        code: 'SOIL',
        name: 'Soil',
        nameBn: 'x',
        measurements: [
          {
            key: 'ph',
            label: 'pH',
            labelBn: 'x',
            min: 9,
            max: 3,
            decimals: 1,
            required: true,
          },
        ],
      } as never),
    ).rejects.toThrow('Measurement ph: min is above max');
    const ok = await service.createFieldRecordType({
      code: 'SOIL',
      name: 'Soil',
      nameBn: 'x',
    } as never);
    expect(ok).toMatchObject({
      requiresPhoto: false,
      requiresLocation: true,
      measurements: [],
    });
  });
});
