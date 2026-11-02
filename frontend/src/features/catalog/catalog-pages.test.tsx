// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/app/navigation';
import { applyLanguage } from '@/i18n';
import {
  fakeServer,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { parseCatalogSearch } from './catalog';
import {
  FarmUpdateTypePage,
  FarmUpdateTypesPage,
  InputPage,
  InputsPage,
  ProduceListPage,
  ProducePage,
  UnitPage,
  UnitsPage,
  WeatherEventPage,
  WeatherEventsPage,
} from './pages';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const unit = (over: object = {}) => ({
  code: 'KG',
  name: 'Kilogram',
  nameBn: 'কিলোগ্রাম',
  active: true,
  sortOrder: 1,
  kind: 'mass',
  symbol: 'kg',
  symbolBn: 'কেজি',
  ...over,
});
const crop = (over: object = {}) => ({
  code: 'MAIZE',
  name: 'Maize',
  nameBn: 'ভুট্টা',
  active: true,
  sortOrder: 1,
  category: 'storable_crop',
  unitCode: 'KG',
  typicalDurationMonths: 5,
  description: 'Grown in winter.',
  descriptionBn: null,
  ...over,
});
const input = (over: object = {}) => ({
  code: 'SEED_MAIZE',
  name: 'Maize Seed',
  nameBn: 'ভুট্টার বীজ',
  active: true,
  sortOrder: 1,
  kind: 'seed',
  unitCode: 'KG',
  produceCode: 'MAIZE',
  description: null,
  ...over,
});
const recordType = (over: object = {}) => ({
  code: 'GROWTH',
  name: 'Growth Check',
  nameBn: 'বৃদ্ধি পরীক্ষা',
  active: true,
  sortOrder: 1,
  requiresPhoto: true,
  requiresLocation: false,
  measurements: [
    {
      key: 'height',
      label: 'Plant Height',
      labelBn: 'গাছের উচ্চতা',
      unit: 'cm',
      min: 0,
      max: 400,
      decimals: 1,
      required: true,
    },
    {
      key: 'count',
      label: 'Plants',
      labelBn: 'গাছ',
      unit: null,
      min: null,
      max: null,
      decimals: 0,
      required: false,
    },
  ],
  ...over,
});
const weather = (over: object = {}) => ({
  code: 'FLOOD',
  name: 'Flood',
  nameBn: 'বন্যা',
  active: true,
  sortOrder: 1,
  description: 'Water over the field.',
  ...over,
});

const catalog = {
  data: {
    version: 'v1',
    units: [
      unit(),
      unit({
        code: 'LITRE',
        name: 'Litre',
        nameBn: 'লিটার',
        kind: 'volume',
        symbol: 'L',
        symbolBn: 'লি',
        active: false,
      }),
    ],
    produceTypes: [
      crop(),
      crop({
        code: 'TOMATO',
        name: 'Tomato',
        nameBn: 'টমেটো',
        category: 'perishable',
        unitCode: 'CRATE',
        typicalDurationMonths: null,
        description: 'Sold fresh.',
        descriptionBn: 'তাজা বিক্রি হয়।',
      }),
    ],
    inputTypes: [
      input(),
      input({
        code: 'UREA',
        name: 'Urea',
        nameBn: 'ইউরিয়া',
        kind: 'fertilizer',
        produceCode: null,
        description: 'Nitrogen.',
      }),
    ],
    fieldRecordTypes: [
      recordType(),
      recordType({
        code: 'VISIT',
        name: 'Visit',
        nameBn: 'পরিদর্শন',
        requiresPhoto: false,
        measurements: [],
      }),
      recordType({
        code: 'SOIL',
        name: 'Soil Check',
        nameBn: 'মাটি পরীক্ষা',
        requiresPhoto: true,
        requiresLocation: true,
        measurements: [],
      }),
    ],
    weatherEventTypes: [
      weather(),
      weather({
        code: 'HAIL',
        name: 'Hail',
        nameBn: 'শিলা',
        description: null,
      }),
    ],
    districts: [],
  },
};

async function show(
  role: Role,
  page: ReactNode,
  path: string,
  write: (s: Sent) => Reply = (s) => ({
    status: s.method === 'POST' ? 201 : 200,
    body: { data: {} },
  }),
  read: () => Reply = () => ({ body: catalog }),
) {
  await signedInAs(role);
  const sent = fakeServer((s) =>
    s.method !== 'GET'
      ? write(s)
      : s.url.pathname === '/api/catalog'
        ? read()
        : undefined,
  );
  const view = await renderPage(page, path);
  return { sent, ...view };
}

const written = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');
const pick = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
};
// Pasted, not typed: each key re-renders the whole form, slow under load.
const put = async (box: HTMLElement, text: string) => {
  await userEvent.clear(box);
  if (!text) return;
  await userEvent.click(box);
  await userEvent.paste(text);
};
const fill = (label: string, text: string) =>
  put(screen.getByLabelText(label), text);
const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('reading the catalog search', () => {
  it('keeps a short search and the editors’ views, and drops the rest', () => {
    expect(parseCatalogSearch({ q: '  maize ', show: 'retired' })).toEqual({
      q: 'maize',
      show: 'retired',
    });
    expect(parseCatalogSearch({ show: 'all' })).toEqual({ show: 'all' });
    expect(parseCatalogSearch({ q: '   ', show: 'active' })).toEqual({});
    expect(parseCatalogSearch({ q: 'x'.repeat(101), show: 3 })).toEqual({});
  });
});

describe('a catalog list', () => {
  it('lets an editor see retired entries, all of them, or search by symbol', async () => {
    const { router, sent } = await show(
      'admin',
      <UnitsPage search={{}} />,
      '/catalog/units',
    );
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Weight')).toBeTruthy();
    expect(within(table).getByText('In Use')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('includeInactive')).toBe('true');
    await pick('Show', 'Retired');
    expect(router.state.location.search).toEqual({ show: 'retired' });
    await pick('Show', 'In Use');
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'kg');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'kg' });
  });

  it('shows the view asked for, and says when it is empty', async () => {
    await show(
      'admin',
      <UnitsPage search={{ show: 'all' }} />,
      '/catalog/units',
    );
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Retired')).toBeTruthy();
    cleanup();

    await show(
      'admin',
      <WeatherEventsPage search={{ show: 'retired' }} />,
      '/catalog/weather-events',
    );
    expect(await screen.findByText('Nothing is retired.')).toBeTruthy();
    cleanup();

    await show(
      'operations',
      <UnitsPage search={{ q: 'litre' }} />,
      '/catalog/units',
    );
    expect(await screen.findByText('Nothing matches')).toBeTruthy();
    expect(
      screen.getByText('Check the spelling, or clear the search.'),
    ).toBeTruthy();
  });

  it('opens an entry from its row or its name', async () => {
    const { router } = await show(
      'farmer',
      <UnitsPage search={{}} />,
      '/catalog/units',
    );
    const table = await screen.findByRole('table');
    await userEvent.click(within(table).getByText('Weight'));
    expect(router.state.location.pathname).toBe('/catalog/units/KG');
    await router.navigate({ to: '/catalog/units' });
    await userEvent.click(
      within(await screen.findByRole('table')).getByRole('link'),
    );
    expect(router.state.location.pathname).toBe('/catalog/units/KG');
  });

  it('tries again after an error', async () => {
    let calls = 0;
    await show(
      'farmer',
      <UnitsPage search={{}} />,
      '/catalog/units',
      undefined,
      () =>
        ++calls > 1
          ? { body: catalog }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('lists crops, inputs, farm update types and weather events with what sets each apart', async () => {
    await show('investor', <ProduceListPage search={{}} />, '/catalog/produce');
    let table = await screen.findByRole('table');
    expect(within(table).getByText('5 months')).toBeTruthy();
    // A unit not in the list shows its code.
    expect(within(table).getByText('CRATE')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
    cleanup();

    await show(
      'investor',
      <InputsPage search={{ q: 'maize' }} />,
      '/catalog/inputs',
    );
    table = await screen.findByRole('table');
    // Found by its crop's name too.
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Seed')).toBeTruthy();
    cleanup();

    await show('investor', <InputsPage search={{}} />, '/catalog/inputs');
    table = await screen.findByRole('table');
    expect(within(table).getByText('Fertilizer')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
    cleanup();

    await show(
      'investor',
      <FarmUpdateTypesPage search={{}} />,
      '/catalog/farm-update-types',
    );
    table = await screen.findByRole('table');
    expect(within(table).getByText('Photo')).toBeTruthy();
    expect(within(table).getByText('Neither')).toBeTruthy();
    expect(within(table).getByText('Photo, Location')).toBeTruthy();
    expect(within(table).getByText('2')).toBeTruthy();
    cleanup();

    await show(
      'investor',
      <WeatherEventsPage search={{}} />,
      '/catalog/weather-events',
    );
    table = await screen.findByRole('table');
    expect(within(table).getByText('Water over the field.')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
  });
});

describe('a catalog entry', () => {
  it('shows an editor its status and lets them edit it', async () => {
    const { sent } = await show(
      'admin',
      <UnitPage code="LITRE" />,
      '/catalog/units/LITRE',
    );
    expect(await screen.findByRole('heading', { name: 'Litre' })).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByText('Volume')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit Litre')).toBeTruthy();
    // Kind and code are fixed once saved.
    expect(within(dialog).getAllByText('Fixed once saved.')).toHaveLength(2);
    await userEvent.click(
      within(dialog).getByRole('switch', { name: /In Use/ }),
    );
    await fill('Symbol', 'l');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.url.pathname).toBe('/api/catalog/units/LITRE');
    expect(written(sent)[0]!.body).toEqual({
      name: 'Litre',
      nameBn: 'লিটার',
      sortOrder: 1,
      symbol: 'l',
      symbolBn: 'লি',
      active: true,
    });
  });

  it('says why it cannot be loaded, and tries again', async () => {
    let calls = 0;
    await show(
      'farmer',
      <WeatherEventPage code="FLOOD" />,
      '/catalog/weather-events/FLOOD',
      undefined,
      () =>
        ++calls > 1
          ? { body: catalog }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    expect(
      (
        await screen.findByRole('link', { name: /Weather Events/ })
      ).getAttribute('href'),
    ).toBe('/catalog/weather-events');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(await screen.findByRole('heading', { name: 'Flood' })).toBeTruthy();
    expect(screen.getByText('Water over the field.')).toBeTruthy();
  });

  it('shows a crop and an input with what they point to', async () => {
    await show(
      'farmer',
      <ProducePage code="TOMATO" />,
      '/catalog/produce/TOMATO',
    );
    expect(await screen.findByText('Sold fresh.')).toBeTruthy();
    expect(
      screen.getByText('Sold fresh after harvest; it is not stored.'),
    ).toBeTruthy();
    // No seeds for it: no seed section.
    expect(screen.queryByText('Seed Inputs for This Crop')).toBeNull();
    cleanup();

    await show(
      'farmer',
      <InputPage code="SEED_MAIZE" />,
      '/catalog/inputs/SEED_MAIZE',
    );
    expect(await screen.findByText('Maize')).toBeTruthy();
    expect(screen.getByText('Kilogram (kg)')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    cleanup();

    await show('farmer', <InputPage code="UREA" />, '/catalog/inputs/UREA');
    expect(await screen.findByText('Nitrogen.')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    cleanup();

    await show(
      'farmer',
      <WeatherEventPage code="HAIL" />,
      '/catalog/weather-events/HAIL',
    );
    expect(await screen.findByText('—')).toBeTruthy();
  });

  it('shows a farm update’s measurements, or that it asks for none', async () => {
    await show(
      'farmer',
      <FarmUpdateTypePage code="GROWTH" />,
      '/catalog/farm-update-types/GROWTH',
    );
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('Plant Height')).toBeTruthy();
    expect(within(rows[1]!).getByText('0 – 400')).toBeTruthy();
    expect(within(rows[1]!).getByText('Yes')).toBeTruthy();
    expect(within(rows[2]!).getByText('— – —')).toBeTruthy();
    expect(within(rows[2]!).getByText('No')).toBeTruthy();
    expect(screen.getAllByText('Yes')).toHaveLength(2);
    cleanup();

    await show(
      'farmer',
      <FarmUpdateTypePage code="VISIT" />,
      '/catalog/farm-update-types/VISIT',
    );
    expect(
      await screen.findByText('This update asks for no numbers.'),
    ).toBeTruthy();
  });

  it('reads in Bengali, the English name below', async () => {
    await signedInAs('farmer');
    await applyLanguage('bn');
    fakeServer(() => ({ body: catalog }));
    await renderPage(<ProducePage code="TOMATO" />, '/catalog/produce/TOMATO');
    expect(await screen.findByRole('heading', { name: 'টমেটো' })).toBeTruthy();
    expect(screen.getByText('Tomato')).toBeTruthy();
    expect(screen.getByText('তাজা বিক্রি হয়।')).toBeTruthy();
    cleanup();

    fakeServer(() => ({ body: catalog }));
    await renderPage(<ProducePage code="MAIZE" />, '/catalog/produce/MAIZE');
    // No Bengali description: the English one stands in.
    expect(await screen.findByText('Grown in winter.')).toBeTruthy();
    expect(screen.getAllByText('কিলোগ্রাম (কেজি)').length).toBeGreaterThan(0);
    cleanup();

    fakeServer(() => ({ body: catalog }));
    await renderPage(
      <FarmUpdateTypePage code="GROWTH" />,
      '/catalog/farm-update-types/GROWTH',
    );
    expect(await screen.findByText('গাছের উচ্চতা')).toBeTruthy();
    await applyLanguage('en');
  });
});

describe('adding and changing entries', () => {
  it('adds a unit once every field is filled in', async () => {
    const { sent } = await show(
      'admin',
      <UnitsPage search={{}} />,
      '/catalog/units',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add Unit' }),
    );
    await fill('Display Order', 'x');
    await save();
    for (const m of [
      'Enter a code: 1–31 of A–Z, 0–9, _ or -.',
      'Enter the English name.',
      'Enter the Bengali name.',
      'Enter a whole number from 0 to 10,000.',
      'Choose one.',
      'Enter the symbol.',
      'Enter the symbol in Bengali.',
    ])
      expect(screen.getByText(m)).toBeTruthy();
    await fill('Name (English)', 'Crate');
    await fill('Name (Bengali)', 'ক্রেট');
    // Typed by hand, the code stops following the name.
    await fill('Code', 'box');
    await fill('Name (English)', 'Crate of 20');
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe(
      'BOX',
    );
    await fill('Display Order', '3');
    await pick('Measure', 'Count');
    await fill('Symbol', 'crate');
    await fill('Symbol in Bengali', 'ক্রেট');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      code: 'BOX',
      name: 'Crate of 20',
      nameBn: 'ক্রেট',
      sortOrder: 3,
      kind: 'count',
      symbol: 'crate',
      symbolBn: 'ক্রেট',
    });
  });

  it('adds a crop with what its category means, and keeps the form when refused', async () => {
    let refuse = true;
    const { sent } = await show(
      'admin',
      <ProduceListPage search={{}} />,
      '/catalog/produce',
      () =>
        refuse
          ? {
              status: 409,
              body: { statusCode: 409, code: 'CODE_TAKEN', message: 'Taken' },
            }
          : { status: 201, body: { data: crop() } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add Crop' }),
    );
    await fill('Name (English)', 'Jute');
    await fill('Name (Bengali)', 'পাট');
    await pick('Category', 'Spice');
    expect(
      screen.getAllByText(
        'After harvest it can be stored in a warehouse against a receipt, and sold or bought back later.',
      ).length,
    ).toBeGreaterThan(0);
    // Retired units are not offered.
    await userEvent.click(screen.getByRole('combobox', { name: 'Unit' }));
    expect(screen.queryByRole('option', { name: /Litre/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('option', { name: 'Kilogram (kg)' }),
    );
    await fill('Typical Duration (Months)', '61');
    await save();
    expect(
      screen.getByText(
        'Enter a whole number of months from 1 to 60, or leave it empty.',
      ),
    ).toBeTruthy();
    await fill('Typical Duration (Months)', '4');
    await fill('Description (English)', ' Golden fibre. ');
    await fill('Description (Bengali)', 'সোনালি আঁশ');
    await save();
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent).at(-1)!.body).toEqual({
      code: 'JUTE',
      name: 'Jute',
      nameBn: 'পাট',
      sortOrder: 0,
      category: 'spice',
      unitCode: 'KG',
      typicalDurationMonths: 4,
      description: 'Golden fibre.',
      descriptionBn: 'সোনালি আঁশ',
    });
  });

  it('adds a crop with only what is required, and closes on Cancel or Escape', async () => {
    const { sent } = await show(
      'admin',
      <ProduceListPage search={{}} />,
      '/catalog/produce',
    );
    const add = await screen.findByRole('button', { name: 'Add Crop' });
    await userEvent.click(add);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(add);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(add);
    await fill('Name (English)', 'Okra');
    await fill('Name (Bengali)', 'ঢেঁড়স');
    await pick('Category', 'Perishable');
    await pick('Unit', 'Kilogram (kg)');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      code: 'OKRA',
      name: 'Okra',
      nameBn: 'ঢেঁড়স',
      sortOrder: 0,
      category: 'perishable',
      unitCode: 'KG',
    });
  });

  it('changes a crop, its category and unit fixed', async () => {
    const { sent } = await show(
      'admin',
      <ProducePage code="MAIZE" />,
      '/catalog/produce/MAIZE',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Storable Crop')).toBeTruthy();
    expect(within(dialog).getByText('Kilogram (kg)')).toBeTruthy();
    await fill('Typical Duration (Months)', '');
    await fill('Description (English)', '');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      name: 'Maize',
      nameBn: 'ভুট্টা',
      sortOrder: 1,
      active: true,
      typicalDurationMonths: null,
      description: null,
      descriptionBn: null,
    });
  });

  it('adds a seed for a crop, or another input for none', async () => {
    const { sent } = await show(
      'operations',
      <InputsPage search={{}} />,
      '/catalog/inputs',
    );
    const add = await screen.findByRole('button', { name: 'Add Input' });
    await userEvent.click(add);
    await save();
    expect(screen.getAllByText('Choose one.')).toHaveLength(2);
    await fill('Name (English)', 'Jute Seed');
    await fill('Name (Bengali)', 'পাটের বীজ');
    await pick('Type', 'Seed');
    await pick('Unit', 'Kilogram (kg)');
    await pick('Crop', 'Maize');
    await fill('Description (English)', 'Certified.');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      code: 'JUTE_SEED',
      name: 'Jute Seed',
      nameBn: 'পাটের বীজ',
      sortOrder: 0,
      kind: 'seed',
      unitCode: 'KG',
      produceCode: 'MAIZE',
      description: 'Certified.',
    });

    await userEvent.click(add);
    await fill('Name (English)', 'Gypsum');
    await fill('Name (Bengali)', 'জিপসাম');
    await pick('Type', 'Seed');
    await pick('Crop', 'Maize');
    // Only seed is for a crop: the choice goes with another type.
    await pick('Type', 'Other');
    expect(screen.queryByRole('combobox', { name: 'Crop' })).toBeNull();
    await pick('Unit', 'Kilogram (kg)');
    await save();
    await waitFor(() => expect(written(sent)).toHaveLength(2));
    expect(written(sent)[1]!.body).toEqual({
      code: 'GYPSUM',
      name: 'Gypsum',
      nameBn: 'জিপসাম',
      sortOrder: 0,
      kind: 'other',
      unitCode: 'KG',
    });
  });

  it('changes an input, showing its crop fixed', async () => {
    const { sent } = await show(
      'admin',
      <InputPage code="SEED_MAIZE" />,
      '/catalog/inputs/SEED_MAIZE',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Maize')).toBeTruthy();
    expect(within(dialog).getAllByText('Fixed once saved.')).toHaveLength(4);
    await fill('Description (English)', 'Hybrid.');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      name: 'Maize Seed',
      nameBn: 'ভুট্টার বীজ',
      sortOrder: 1,
      active: true,
      description: 'Hybrid.',
    });
    cleanup();

    await show('admin', <InputPage code="UREA" />, '/catalog/inputs/UREA');
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    expect(
      within(screen.getByRole('dialog')).getAllByText('Fixed once saved.'),
    ).toHaveLength(3);
  });

  it('adds and changes a weather event', async () => {
    const { sent } = await show(
      'admin',
      <WeatherEventsPage search={{}} />,
      '/catalog/weather-events',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add Weather Event' }),
    );
    await save();
    expect(screen.getByText('Enter the English name.')).toBeTruthy();
    await fill('Name (English)', 'Cyclone');
    await fill('Name (Bengali)', 'ঘূর্ণিঝড়');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      code: 'CYCLONE',
      name: 'Cyclone',
      nameBn: 'ঘূর্ণিঝড়',
      sortOrder: 0,
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Weather Event' }),
    );
    await fill('Name (English)', 'Drought');
    await fill('Name (Bengali)', 'খরা');
    await fill('Description (English)', 'No rain.');
    await save();
    await waitFor(() => expect(written(sent)).toHaveLength(2));
    expect(written(sent)[1]!.body).toMatchObject({ description: 'No rain.' });
    cleanup();

    const edit = await show(
      'admin',
      <WeatherEventPage code="FLOOD" />,
      '/catalog/weather-events/FLOOD',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    await fill('Description (English)', '');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(edit.sent)[0]!.body).toEqual({
      name: 'Flood',
      nameBn: 'বন্যা',
      sortOrder: 1,
      active: true,
      description: null,
    });
  });
});

describe('a farm update type’s form', () => {
  it('adds one with measurements, keys following labels, and refuses what the server would', async () => {
    const { sent } = await show(
      'admin',
      <FarmUpdateTypesPage search={{}} />,
      '/catalog/farm-update-types',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add Farm Update Type' }),
    );
    expect(screen.getByText('This update asks for no numbers.')).toBeTruthy();
    await fill('Name (English)', 'Pest Check');
    await fill('Name (Bengali)', 'পোকা পরীক্ষা');
    await userEvent.click(
      screen.getByRole('switch', { name: /Photo Required/ }),
    );
    await userEvent.click(
      screen.getByRole('switch', { name: /Location Required/ }),
    );

    const add = screen.getByRole('button', { name: /Add Measurement/ });
    await userEvent.click(add);
    await userEvent.click(add);
    const items = () => screen.getAllByRole('listitem');
    expect(items()).toHaveLength(2);
    const first = () => within(items()[0]!);
    const second = () => within(items()[1]!);
    expect(
      first().getByRole('button', { name: 'Move Up' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      second()
        .getByRole('button', { name: 'Move Down' })
        .hasAttribute('disabled'),
    ).toBe(true);

    await save();
    expect(first().getByText('Enter the English label.')).toBeTruthy();
    expect(first().getByText('Enter the Bengali label.')).toBeTruthy();
    expect(
      first().getByText(
        'Use lower-case letters, digits and _, starting with a letter.',
      ),
    ).toBeTruthy();

    await put(first().getByLabelText('Label (English)'), 'Pests per leaf');
    expect((first().getByLabelText('Key') as HTMLInputElement).value).toBe(
      'pests_per_leaf',
    );
    await put(first().getByLabelText('Label (Bengali)'), 'পাতায় পোকা');
    await put(first().getByLabelText('Minimum'), '10');
    await put(first().getByLabelText('Maximum'), '5');
    await put(second().getByLabelText('Label (English)'), 'Leaves');
    await put(second().getByLabelText('Label (Bengali)'), 'পাতা');
    await put(second().getByLabelText('Key'), 'PESTS_PER_LEAF');
    await put(second().getByLabelText('Minimum'), 'a');
    await put(second().getByLabelText('Maximum'), '1.25');
    expect(
      first().getByText('The minimum must not be above the maximum.'),
    ).toBeTruthy();
    expect(second().getByText('Each key may be used once.')).toBeTruthy();
    expect(
      second().getAllByText('Enter a number, or leave it empty.'),
    ).toHaveLength(1);
    expect(
      second().getByText(
        'The minimum or maximum has more decimal places than this allows.',
      ),
    ).toBeTruthy();

    await put(first().getByLabelText('Maximum'), '50');
    await put(second().getByLabelText('Key'), 'leaves');
    await userEvent.clear(second().getByLabelText('Minimum'));
    await put(second().getByLabelText('Unit Shown'), ' cm ');
    await userEvent.click(
      second().getByRole('combobox', { name: 'Decimal Places' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: '2 decimal places' }),
    );
    await userEvent.click(second().getByRole('switch', { name: 'Required' }));

    // Leaves first, then a third one added and removed again.
    await userEvent.click(second().getByRole('button', { name: 'Move Up' }));
    expect((first().getByLabelText('Key') as HTMLInputElement).value).toBe(
      'leaves',
    );
    await userEvent.click(first().getByRole('button', { name: 'Move Down' }));
    await userEvent.click(second().getByRole('button', { name: 'Move Up' }));
    await userEvent.click(add);
    await userEvent.click(
      within(items()[2]!).getByRole('button', { name: 'Remove Measurement' }),
    );
    expect(items()).toHaveLength(2);

    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.body).toEqual({
      code: 'PEST_CHECK',
      name: 'Pest Check',
      nameBn: 'পোকা পরীক্ষা',
      sortOrder: 0,
      requiresPhoto: true,
      requiresLocation: false,
      measurements: [
        {
          key: 'leaves',
          label: 'Leaves',
          labelBn: 'পাতা',
          unit: 'cm',
          min: null,
          max: 1.25,
          decimals: 2,
          required: false,
        },
        {
          key: 'pests_per_leaf',
          label: 'Pests per leaf',
          labelBn: 'পাতায় পোকা',
          unit: null,
          min: 10,
          max: 50,
          decimals: 0,
          required: true,
        },
      ],
    });
  });

  it('changes one, keeping its measurements', async () => {
    const { sent } = await show(
      'admin',
      <FarmUpdateTypePage code="GROWTH" />,
      '/catalog/farm-update-types/GROWTH',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit Growth Check')).toBeTruthy();
    expect(
      (within(dialog).getAllByLabelText('Key')[0] as HTMLInputElement).value,
    ).toBe('height');
    // The key was saved: a new label does not change it.
    const label = within(dialog).getAllByLabelText('Label (English)')[0]!;
    await put(label, 'Height');
    expect(
      (within(dialog).getAllByLabelText('Key')[0] as HTMLInputElement).value,
    ).toBe('height');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written(sent)[0]!.url.pathname).toBe(
      '/api/catalog/field-record-types/GROWTH',
    );
    expect(written(sent)[0]!.body).toMatchObject({
      active: true,
      requiresPhoto: true,
      requiresLocation: false,
      measurements: [
        { key: 'height', label: 'Height', min: 0, max: 400, unit: 'cm' },
        { key: 'count', min: null, max: null, unit: null },
      ],
    });
  });

  // Twenty measurement editors take seconds to draw, more under coverage.
  it('stops adding measurements at twenty', { timeout: 60_000 }, async () => {
    const many = recordType({
      code: 'MANY',
      measurements: Array.from({ length: 19 }, (_, i) => ({
        ...recordType().measurements[1]!,
        key: `count_${i}`,
      })),
    });
    await show(
      'admin',
      <FarmUpdateTypePage code="MANY" />,
      '/catalog/farm-update-types/MANY',
      undefined,
      () => ({
        body: {
          data: { ...catalog.data, fieldRecordTypes: [many] },
        },
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const add = screen.getByRole('button', { name: /Add Measurement/ });
    expect(add.hasAttribute('disabled')).toBe(false);
    await userEvent.click(add);
    expect(add.hasAttribute('disabled')).toBe(true);
  });
});
