// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ClaimDto,
  CoverageDto,
  InsuredProjectDto,
  WeatherEventDto,
} from '@/api/generated/insurance';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { ClaimPage } from './claim-page';
import { coverState, typedPercent } from './insurance-utils';
import { InsuredProjectPage } from './insured-project-page';
import { InsuredProjectsList } from './insured-projects-list';
import { WeatherEventsList } from './weather-events-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CLAIM = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';
const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages: 1 },
});
const FLOOD = { code: 'FLOOD', name: 'Flood', nameBn: 'বন্যা' };
const CYCLONE = { code: 'CYCLONE', name: 'Cyclone', nameBn: 'ঘূর্ণিঝড়' };

const coverage = (over: Partial<CoverageDto> = {}): CoverageDto => ({
  projectId: PROJECT,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  farmer: { id: 'f1', name: 'Karim Islam' },
  district: { code: 'BOGURA', name: 'Bogura' },
  produceCode: 'MAIZE',
  stage: 'active',
  inField: true,
  insurer: { id: 'me', name: 'Green Delta' },
  insurerFixed: false,
  current: {
    maxAmount: '30000.00',
    coveredEventTypes: [CYCLONE, FLOOD],
    notes: 'Flood or cyclone',
    termsHash: '0x1',
    status: 'recorded',
    recordedAt: '2026-10-20T05:00:00.000Z',
  },
  approvedTotal: '0.00',
  paidTotal: '0.00',
  remaining: '30000.00',
  openClaims: 0,
  unpaidClaims: 0,
  history: [],
  ...over,
});

const event = (over: Partial<WeatherEventDto> = {}): WeatherEventDto => ({
  id: EVENT,
  district: { code: 'BOGURA', name: 'Bogura' },
  eventType: FLOOD,
  occurredOn: '2026-10-18',
  severity: 'severe',
  notes: 'River above danger level',
  status: 'recorded',
  recordedAt: '2026-10-18T05:00:00.000Z',
  recordedBy: { id: 'a1', name: 'Tania Admin' },
  ...over,
});

const claim = (over: Partial<ClaimDto> = {}): ClaimDto => ({
  id: CLAIM,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  event: event(),
  damagePercent: '40.5',
  notes: 'Half the field under water',
  photos: [],
  openedBy: { id: 'o1', name: 'Imran Officer' },
  status: 'under_review',
  openedAt: '2026-10-19T05:00:00.000Z',
  assessment: null,
  approvedAmount: null,
  decidedAt: null,
  insurer: { id: 'me', name: 'Green Delta' },
  paidAt: null,
  paymentReference: null,
  claimHash: '0x2',
  assessmentHash: null,
  ...over,
});

const catalog = {
  data: {
    version: '1',
    units: [],
    produceTypes: [
      {
        code: 'MAIZE',
        name: 'Maize',
        nameBn: 'ভুট্টা',
        active: true,
        sortOrder: 1,
        category: 'storable_crop',
        unitCode: 'KG',
      },
    ],
    inputTypes: [],
    fieldRecordTypes: [],
    weatherEventTypes: [
      { ...FLOOD, active: true, sortOrder: 1 },
      { ...CYCLONE, active: true, sortOrder: 2 },
    ],
    districts: [],
  },
};

describe('insurance helpers', () => {
  it('reads a damage percentage as typed, in either script', () => {
    expect(typedPercent('৪০.৫')).toBe('40.5');
    expect(typedPercent('100')).toBe('100');
    expect(typedPercent('35 %')).toBe('35');
    expect(typedPercent('100.5')).toBeNull();
    expect(typedPercent('12.25')).toBeNull();
  });

  it('says where a project stands with its insurer', () => {
    expect(coverState({ insurer: null, maxAmount: null })).toBe('unassigned');
    expect(
      coverState({ insurer: { id: 'i', name: 'I' }, maxAmount: null }),
    ).toBe('no_cover');
    expect(
      coverState({ insurer: { id: 'i', name: 'I' }, maxAmount: '1.00' }),
    ).toBe('covered');
  });
});

describe('insured projects', () => {
  it('lets the office find projects still without an insurer', async () => {
    await signedInAs('admin');
    const project: InsuredProjectDto = {
      project: { id: PROJECT, name: 'Maize in Bogura' },
      district: { code: 'BOGURA', name: 'Bogura' },
      produceCode: 'MAIZE',
      stage: 'active',
      farmer: { id: 'f1', name: 'Karim Islam' },
      insurer: null,
      maxAmount: null,
    };
    const sent = fakeServer(({ url }) => {
      if (url.pathname === '/api/insurance/projects')
        return { body: page([project]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      return undefined;
    });
    await renderPage(
      <InsuredProjectsList search={{ tab: 'unassigned', q: 'Karim' }} />,
      '/insurance',
    );
    expect(await screen.findByText('Maize in Bogura')).toBeTruthy();
    expect(screen.getAllByText('No Insurer Yet').length).toBeGreaterThan(0);
    const params = sent.find(
      (s) => s.url.pathname === '/api/insurance/projects',
    )!.url.searchParams;
    expect(params.get('cover')).toBe('unassigned');
    expect(params.get('q')).toBe('Karim');
  });

  it('lets an admin assign the insurer', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/insurance/projects/${PROJECT}/coverage`)
        return { body: { data: coverage({ insurer: null, current: null }) } };
      if (url.pathname === '/api/insurance/claims') return { body: page([]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      if (url.pathname === '/api/participants')
        return {
          body: page([
            {
              id: 'ins-2',
              fullName: 'Green Delta',
              role: 'insurer',
              status: 'verified',
            },
          ]),
        };
      if (
        method === 'PUT' &&
        url.pathname === `/api/insurance/projects/${PROJECT}/insurer`
      )
        return { body: { data: coverage({ current: null }) } };
      return undefined;
    });
    await renderPage(
      <InsuredProjectPage projectId={PROJECT} />,
      `/insurance/projects/${PROJECT}`,
    );
    expect(
      await screen.findByText('An admin has not assigned an insurer yet.'),
    ).toBeTruthy();
    // No cover yet, so no claim.
    expect(screen.queryByRole('button', { name: 'Open Claim' })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Assign Insurer' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /Green Delta/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Assign' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'PUT')?.body).toEqual({
        insurerId: 'ins-2',
      }),
    );
  });

  it('lets the assigned insurer set the cover, never below what is approved', async () => {
    await signedInAs('insurer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/insurance/projects/${PROJECT}/coverage`)
        return method === 'PUT'
          ? { body: { data: coverage() } }
          : {
              body: {
                data: coverage({ current: null, approvedTotal: '0.00' }),
              },
            };
      if (url.pathname === '/api/insurance/claims') return { body: page([]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      return undefined;
    });
    await renderPage(
      <InsuredProjectPage projectId={PROJECT} />,
      `/insurance/projects/${PROJECT}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Set Cover' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save Cover' }),
    );
    expect(
      within(dialog).getByText('Choose at least one weather event.'),
    ).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Maximum Cover'),
      '৩০০০০',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Flood' }),
    );
    await userEvent.type(within(dialog).getByLabelText('Terms'), 'Flood only');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save Cover' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'PUT')?.body).toEqual({
        maxAmount: '30000',
        coveredEventTypes: ['FLOOD'],
        notes: 'Flood only',
      }),
    );
  });

  it('lets the farmer’s officer open a claim citing a covered event', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/insurance/projects/${PROJECT}/coverage`)
        return { body: { data: coverage() } };
      if (url.pathname === '/api/insurance/claims') return { body: page([]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      if (url.pathname === '/api/insurance/weather-events')
        return {
          body: page([
            event(),
            // A drought is not covered: not offered.
            event({
              id: 'e2',
              eventType: { code: 'DROUGHT', name: 'Drought', nameBn: 'খরা' },
            }),
          ]),
        };
      if (
        method === 'POST' &&
        url.pathname === `/api/insurance/projects/${PROJECT}/claims`
      )
        return { status: 201, body: { data: claim({ status: 'triggered' }) } };
      return undefined;
    });
    await renderPage(
      <InsuredProjectPage projectId={PROJECT} />,
      `/insurance/projects/${PROJECT}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open Claim' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Drought/ })).toBeNull();
    await userEvent.click(await screen.findByRole('option', { name: /Flood/ }));
    await userEvent.type(
      within(dialog).getByLabelText('Damage Seen (%)'),
      '40.5',
    );
    await userEvent.type(
      within(dialog).getByLabelText('What Happened'),
      'Half the field under water',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Open Claim' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({
        eventId: EVENT,
        damagePercent: '40.5',
        notes: 'Half the field under water',
      }),
    );
  });
});

describe('claims', () => {
  it('lets the project’s insurer approve within the cover remaining', async () => {
    await signedInAs('insurer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/insurance/claims/${CLAIM}`)
        return { body: { data: claim() } };
      if (url.pathname === `/api/insurance/projects/${PROJECT}/coverage`)
        return { body: { data: coverage({ remaining: '20000.00' }) } };
      if (
        method === 'POST' &&
        url.pathname === `/api/insurance/claims/${CLAIM}/approve`
      )
        return {
          body: {
            data: claim({ status: 'approved', approvedAmount: '15000.00' }),
          },
        };
      return undefined;
    });
    await renderPage(<ClaimPage id={CLAIM} />, `/insurance/claims/${CLAIM}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve Claim' }),
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Cover remaining: ৳ 20,000.');
    await userEvent.type(
      within(dialog).getByLabelText('Approved Amount'),
      '20001',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Findings'),
      'Confirmed on site',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Approve Claim' }),
    );
    expect(within(dialog).getByText(/at most ৳ 20,000/)).toBeTruthy();
    const amount = within(dialog).getByLabelText('Approved Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '15000');
    await userEvent.type(
      within(dialog).getByLabelText('Damage Found (%)'),
      '35',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Approve Claim' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname.endsWith('/approve'))?.body,
      ).toEqual({
        amount: '15000',
        damagePercent: '35',
        notes: 'Confirmed on site',
      }),
    );
  });

  it('lets Accounts record the insurer’s payment, and shows the farmer no moves', async () => {
    await signedInAs('accounts');
    const approved = claim({
      status: 'approved',
      approvedAmount: '15000.00',
      decidedAt: '2026-10-21T05:00:00.000Z',
      assessment: { damagePercent: '35.0', notes: 'Confirmed', photoUrl: null },
    });
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/insurance/claims/${CLAIM}`)
        return { body: { data: approved } };
      if (
        method === 'POST' &&
        url.pathname === `/api/insurance/claims/${CLAIM}/payment`
      )
        return { body: { data: { ...approved, status: 'paid' } } };
      return undefined;
    });
    await renderPage(<ClaimPage id={CLAIM} />, `/insurance/claims/${CLAIM}`);
    expect(await screen.findByText('Insurer’s Assessment')).toBeTruthy();
    expect(screen.getAllByText('Payment Due').length).toBeGreaterThan(0);
    await userEvent.click(
      screen.getByRole('button', { name: 'Record Insurer’s Payment' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Green Delta’s ৳ 15,000/)).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Payment Reference'),
      ' TRX 77 ',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Insurer’s Payment' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({
        paymentReference: 'TRX 77',
      }),
    );
    cleanup();

    await signedInAs('farmer');
    fakeServer(({ url }) =>
      url.pathname === `/api/insurance/claims/${CLAIM}`
        ? { body: { data: approved } }
        : undefined,
    );
    await renderPage(<ClaimPage id={CLAIM} />, `/insurance/claims/${CLAIM}`);
    await screen.findByText('Insurer’s Assessment');
    expect(
      screen.queryByRole('button', { name: /Record|Approve|Reject/ }),
    ).toBeNull();
  });
});

describe('weather events', () => {
  it('lets an insurer record an event and everyone search them', async () => {
    await signedInAs('insurer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/insurance/weather-events')
        return method === 'POST'
          ? { status: 201, body: { data: event() } }
          : { body: page([event()]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      return undefined;
    });
    await renderPage(
      <WeatherEventsList search={{ q: 'flood' }} />,
      '/insurance/weather-events',
    );
    expect(await screen.findByText('Flood · Bogura')).toBeTruthy();
    expect(
      sent
        .find((s) => s.url.pathname === '/api/insurance/weather-events')!
        .url.searchParams.get('q'),
    ).toBe('flood');
    await userEvent.click(screen.getByRole('button', { name: /Record Event/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Event' }),
    );
    expect(within(dialog).getByText('Choose how severe it was.')).toBeTruthy();
    await userEvent.click(within(dialog).getAllByRole('combobox')[0]!);
    await userEvent.click(
      await screen.findByRole('option', { name: 'Cyclone' }),
    );
    await userEvent.type(within(dialog).getByLabelText('District'), 'Bogura');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Severe' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Event' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toMatchObject({
        districtCode: 'BOGURA',
        eventTypeCode: 'CYCLONE',
        severity: 'severe',
      }),
    );
  });
});
