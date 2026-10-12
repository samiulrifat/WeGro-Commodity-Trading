import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { checkMeasurements, decimalPlaces } from './catalog.service';
import { CodeList } from './code-list';
import type { MeasurementDto } from './dto/catalog-request.dto';

const entry = (
  code: string,
  name: string,
  sortOrder: number,
  active = true,
) => ({
  code,
  name,
  active,
  sortOrder,
});

describe('CodeList', () => {
  const list = new CodeList<ReturnType<typeof entry>>('produce type');

  beforeEach(() => {
    list.load([
      entry('WHEAT', 'Wheat', 2),
      entry('MAIZE', 'Maize', 1),
      entry('BARLEY', 'Barley', 2),
      entry('OLD', 'Old crop', 0, false),
    ]);
  });

  it('sorts by sort order, then name, and hides inactive entries unless asked', () => {
    expect(list.list().map((e) => e.code)).toEqual([
      'MAIZE',
      'BARLEY',
      'WHEAT',
    ]);
    expect(list.list(true).map((e) => e.code)).toEqual([
      'OLD',
      'MAIZE',
      'BARLEY',
      'WHEAT',
    ]);
  });

  it('reuses the sorted list until something changes', () => {
    const first = list.list();
    expect(list.list()).toBe(first);
    list.put(entry('RYE', 'Rye', 3));
    expect(list.list()).not.toBe(first);
    expect(list.list().at(-1)!.code).toBe('RYE');
  });

  it('hands out frozen entries', () => {
    expect(Object.isFrozen(list.get('MAIZE'))).toBe(true);
  });

  it('answers 404 for a missing entry and 422 for a bad reference', () => {
    expect(() => list.find('NOPE')).toThrow(NotFoundException);
    expect(() => list.requireActive('NOPE')).toThrow(
      UnprocessableEntityException,
    );
    expect(() => list.requireActive('OLD')).toThrow('no longer in use');
    expect(list.requireActive('MAIZE').name).toBe('Maize');
  });
});

describe('decimalPlaces', () => {
  it.each([
    [0, 0],
    [12, 0],
    [2.5, 1],
    [0.125, 3],
    [1e-3, 3],
    [1.5e-2, 3],
    [1e21, 0],
    [-3.75, 2],
  ])('%p has %p decimal places', (n, places) => {
    expect(decimalPlaces(n)).toBe(places);
  });
});

describe('checkMeasurements', () => {
  const m = (over: Partial<MeasurementDto> = {}): MeasurementDto => ({
    key: 'plant_height',
    label: 'Plant height',
    labelBn: 'গাছের উচ্চতা',
    unit: 'cm',
    min: 0,
    max: 500,
    decimals: 0,
    required: false,
    ...over,
  });

  it('normalises missing optional fields to null', () => {
    expect(
      checkMeasurements([
        m({ unit: undefined, min: undefined, max: undefined }),
      ]),
    ).toEqual([expect.objectContaining({ unit: null, min: null, max: null })]);
  });

  it('rejects repeated keys, inverted ranges and bounds finer than the decimals', () => {
    expect(() => checkMeasurements([m(), m()])).toThrow('used twice');
    expect(() => checkMeasurements([m({ min: 10, max: 5 })])).toThrow(
      'min is above max',
    );
    expect(() => checkMeasurements([m({ max: 2.5 })])).toThrow(
      'decimal places',
    );
    expect(checkMeasurements([m({ max: 2.5, decimals: 1 })])[0].max).toBe(2.5);
  });
});
