// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import {
  decimalsOf,
  findEntries,
  numberOf,
  suggestCode,
  suggestKey,
} from './catalog';
import { measurementProblems, newMeasurement } from './measurements';
import { ProduceListPage, ProducePage } from './pages';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entry = (over: object) => ({
  code: 'MAIZE',
  name: 'Maize',
  nameBn: 'ভুট্টা',
  active: true,
  sortOrder: 1,
  category: 'storable_crop',
  unitCode: 'KG',
  typicalDurationMonths: 5,
  description: null,
  descriptionBn: null,
  ...over,
});

const catalog = (over: object = {}) => ({
  data: {
    version: 'v1',
    units: [
      {
        code: 'KG',
        name: 'Kilogram',
        nameBn: 'কিলোগ্রাম',
        active: true,
        sortOrder: 1,
        kind: 'mass',
        symbol: 'kg',
      },
    ],
    produceTypes: [
      entry({}),
      entry({
        code: 'BORO_RICE',
        name: 'Boro Rice',
        nameBn: 'বোরো ধান',
        active: false,
      }),
    ],
    inputTypes: [
      {
        code: 'SEED_MAIZE',
        name: 'Maize Seed',
        nameBn: 'ভুট্টার বীজ',
        active: true,
        sortOrder: 1,
        kind: 'seed',
        unitCode: 'KG',
        produceCode: 'MAIZE',
        description: null,
      },
    ],
    fieldRecordTypes: [],
    weatherEventTypes: [],
    districts: [],
    ...over,
  },
});

describe('catalog helpers', () => {
  it('suggests codes and keys from names', () => {
    expect(suggestCode('Boro rice')).toBe('BORO_RICE');
    expect(suggestCode('  Zinc   sulphate (granular) ')).toBe(
      'ZINC_SULPHATE_GRANULAR',
    );
    expect(suggestCode('ধান')).toBe('');
    expect(suggestKey('Plant height, in cm')).toBe('plant_height_in_cm');
    expect(suggestKey('2nd count')).toBe('');
  });

  it('finds entries by the start of any word, in either language, or the code', () => {
    const list = catalog().data.produceTypes;
    expect(findEntries(list, 'mai', 'active').map((e) => e.code)).toEqual([
      'MAIZE',
    ]);
    expect(findEntries(list, 'ভুট্টা', 'active')).toHaveLength(1);
    expect(findEntries(list, 'rice', 'active')).toHaveLength(0);
    expect(findEntries(list, 'rice', 'retired')).toHaveLength(1);
    expect(findEntries(list, 'boro_rice', 'all')).toHaveLength(1);
    expect(findEntries(list, undefined, 'all')).toHaveLength(2);
  });

  it('reads numbers as the server will check them', () => {
    expect(numberOf('')).toBeNull();
    expect(numberOf('১২.৫')).toBe(12.5);
    expect(Number.isNaN(numberOf('12,5')!)).toBe(true);
    expect(decimalsOf(2.5)).toBe(1);
    expect(decimalsOf(100)).toBe(0);
    expect(decimalsOf(0.001)).toBe(3);
  });

  it('finds what the server would refuse in measurements', () => {
    const a = {
      ...newMeasurement(),
      key: 'height',
      label: 'Height',
      labelBn: 'উচ্চতা',
    };
    const b = { ...a, id: 'other', min: '10', max: '5' };
    const c = { ...a, id: 'third', key: 'ratio', min: '0.25', decimals: 1 };
    const problems = measurementProblems([a, b, c]);
    expect([...problems.get(a.id)!]).toEqual(['keyRepeated']);
    expect([...problems.get('other')!]).toEqual(['keyRepeated', 'range']);
    expect([...problems.get('third')!]).toEqual(['decimals']);
  });
});

describe('catalog pages', () => {
  it('shows a reader only entries in use, without editing', async () => {
    await signedInAs('farmer');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: catalog() } : undefined,
    );
    await renderPage(<ProduceListPage search={{}} />, '/catalog/produce');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Maize')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Crop' })).toBeNull();
    expect(sent[0]!.url.searchParams.get('includeInactive')).toBeNull();
  });

  it('lets an editor add a crop, its code suggested from the name', async () => {
    await signedInAs('operations');
    const sent = fakeServer(({ method, url }) =>
      url.pathname === '/api/catalog'
        ? { body: catalog() }
        : method === 'POST' && url.pathname === '/api/catalog/produce-types'
          ? { status: 201, body: { data: entry({ code: 'BORO_RICE' }) } }
          : undefined,
    );
    await renderPage(<ProduceListPage search={{}} />, '/catalog/produce');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add Crop' }),
    );
    await userEvent.type(screen.getByLabelText('Name (English)'), 'Boro rice');
    expect(
      (screen.getByLabelText('Code', { exact: true }) as HTMLInputElement)
        .value,
    ).toBe('BORO_RICE');
    await userEvent.type(screen.getByLabelText('Name (Bengali)'), 'বোরো ধান');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Category and unit are still missing.
    expect(screen.getAllByText('Choose one.')).toHaveLength(2);
    expect(sent.some((s) => s.method === 'POST')).toBe(false);
  });

  it('opens an entry with what it means, and the seeds for a crop', async () => {
    await signedInAs('investor');
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: catalog() } : undefined,
    );
    await renderPage(<ProducePage code="MAIZE" />, '/catalog/produce/MAIZE');
    expect(await screen.findByRole('heading', { name: 'Maize' })).toBeTruthy();
    expect(screen.getByText('Storable Crop')).toBeTruthy();
    expect(screen.getByText('Kilogram (kg)')).toBeTruthy();
    expect(screen.getByText('Maize Seed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('does not show a reader a retired entry', async () => {
    await signedInAs('investor');
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: catalog() } : undefined,
    );
    await renderPage(<ProducePage code="NOPE" />, '/catalog/produce/NOPE');
    await waitFor(() =>
      expect(screen.getByText('Entry Not Found')).toBeTruthy(),
    );
  });
});
