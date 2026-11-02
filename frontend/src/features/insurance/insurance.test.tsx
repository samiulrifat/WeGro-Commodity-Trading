// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ClaimDto,
  CoverageDto,
  InsuredProjectDto,
  WeatherEventDto,
} from '@/api/generated/insurance';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { ClaimsList } from './claims-list';
import { ProjectInsurance } from './project-insurance';
import { useDistrictName } from './use-names';
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

const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});
const pages = <T,>(data: T[], totalPages: number) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages },
});
const writes = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');

describe('a claim, further', () => {
  const at = (
    role: Parameters<typeof signedInAs>[0],
    c: ClaimDto | (() => Reply),
    write: (s: Sent) => Reply = () => ({ body: { data: claim() } }),
  ) =>
    (async () => {
      await signedInAs(role);
      const sent = fakeServer((s) => {
        if (s.method !== 'GET') return write(s);
        if (s.url.pathname === `/api/insurance/claims/${CLAIM}`)
          return typeof c === 'function' ? c() : { body: { data: c } };
        if (s.url.pathname.includes('/photos/')) return { body: 'jpg' };
        return undefined;
      });
      await renderPage(<ClaimPage id={CLAIM} />, `/insurance/claims/${CLAIM}`);
      return sent;
    })();

  it('lets the insurer start the review of a new claim, keeping the dialog when refused', async () => {
    Object.assign(URL, {
      createObjectURL: () => 'blob:photo',
      revokeObjectURL: () => undefined,
    });
    let refuse = true;
    const sent = await at(
      'insurer',
      claim({
        status: 'triggered',
        photos: [`/api/insurance/claims/${CLAIM}/photos/1`],
      }),
      () =>
        refuse
          ? failure(409, 'CLAIM_NOT_TRIGGERED')
          : { body: { data: claim() } },
    );
    expect(
      await screen.findByRole('img', { name: 'Damage photo 1' }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Start Review' }));
    const dialog = screen.getByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Start Review' });
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.url.pathname).toBe(
      `/api/insurance/claims/${CLAIM}/review`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start Review' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets the insurer reject with findings, keeping the dialog when refused', async () => {
    let refuse = true;
    const sent = await at('insurer', claim(), () =>
      refuse
        ? failure(409, 'CLAIM_DECIDED')
        : { body: { data: claim({ status: 'rejected' }) } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reject Claim' }),
    );
    const dialog = screen.getByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Reject Claim' });
    await userEvent.type(
      within(dialog).getByLabelText('Damage Found (%)'),
      'lots',
    );
    await userEvent.click(go);
    expect(within(dialog).getByText('Write what you found.')).toBeTruthy();
    await userEvent.clear(within(dialog).getByLabelText('Damage Found (%)'));
    await userEvent.type(
      within(dialog).getByLabelText('Findings'),
      'No flood here',
    );
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.body).toEqual({ notes: 'No flood here' });
    await userEvent.click(screen.getByRole('button', { name: 'Reject Claim' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('wants the insurer’s payment reference, keeping the dialog when refused', async () => {
    let refuse = true;
    const approved = claim({ status: 'approved', approvedAmount: '15000.00' });
    await at('accounts', approved, () =>
      refuse
        ? failure(409, 'PAYMENT_REF_ALREADY_USED')
        : { body: { data: approved } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Record Insurer’s Payment' }),
    );
    const dialog = screen.getByRole('dialog');
    const go = within(dialog).getByRole('button', {
      name: 'Record Insurer’s Payment',
    });
    await userEvent.click(go);
    expect(
      within(dialog)
        .getByLabelText('Payment Reference')
        .getAttribute('aria-invalid'),
    ).toBe('true');
    await userEvent.type(
      within(dialog).getByLabelText('Payment Reference'),
      'TRX 1',
    );
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(
      screen.getByRole('button', { name: 'Record Insurer’s Payment' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await at('farmer', () =>
      ++calls > 1 ? { body: { data: claim() } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Half the field under water')).toBeTruthy();
  });
});

describe('the claims list', () => {
  it('moves between tabs and pages, and searches', async () => {
    await signedInAs('insurer');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/insurance/claims'
        ? { body: pages([claim({ approvedAmount: '15000.00' })], 2) }
        : undefined,
    );
    const { router } = await renderPage(
      <ClaimsList search={{}} />,
      '/insurance/claims',
    );
    expect(await screen.findByText('৳ 15,000')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Under Review' }));
    expect(router.state.location.search).toEqual({ tab: 'under_review' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'maize');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'maize' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    expect(sent[0]!.url.searchParams.get('status')).toBeNull();
  });

  it('starts Accounts on payments due, and tries again after an error', async () => {
    await signedInAs('accounts');
    let calls = 0;
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/insurance/claims'
        ? ++calls > 1
          ? { body: page([]) }
          : failure(500, 'X')
        : undefined,
    );
    await renderPage(<ClaimsList search={{}} />, '/insurance/claims');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No claims here.')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('paymentDue')).toBe('true');
  });

  it('opens a claim on an insured project picked from the list, keeping it when refused', async () => {
    recordForms();
    await signedInAs('field_officer');
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST') return failure(409, 'EVENT_NOT_COVERED');
      if (url.pathname === '/api/insurance/claims') return { body: page([]) };
      if (url.pathname === '/api/projects')
        return {
          body: page(
            url.searchParams.get('stage') === 'active'
              ? [
                  project({
                    id: PROJECT,
                    title: 'Maize in Bogura',
                    insured: true,
                  }),
                  project({ id: 'p9', title: 'Not insured', insured: false }),
                ]
              : [],
          ),
        };
      if (url.pathname === `/api/insurance/projects/${PROJECT}/coverage`)
        return { body: { data: coverage() } };
      if (url.pathname === '/api/insurance/weather-events')
        return { body: page([event()]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      return undefined;
    });
    await renderPage(<ClaimsList search={{ q: 'zz' }} />, '/insurance/claims');
    expect(await screen.findByText('No claims match.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Open Claim/ }));
    const dialog = screen.getByRole('dialog');
    const open = within(dialog).getByRole('button', { name: 'Open Claim' });
    await userEvent.click(open);
    expect(
      within(dialog).getByText('Say what happened to the crop.'),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByLabelText('Project', { selector: 'input' }),
    );
    expect(screen.queryByRole('option', { name: /Not insured/ })).toBeNull();
    await userEvent.click(
      await screen.findByRole('option', { name: /Maize in Bogura/ }),
    );
    await userEvent.click(
      await within(dialog).findByRole('combobox', { name: 'Weather Event' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: /Flood/ }));
    await userEvent.type(
      within(dialog).getByLabelText('Damage Seen (%)'),
      '40',
    );
    await userEvent.type(
      within(dialog).getByLabelText('What Happened'),
      'Water',
    );
    await userEvent.click(open);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(writes(sent)[0]!.url.pathname).toBe(
      `/api/insurance/projects/${PROJECT}/claims`,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('insured projects, further', () => {
  it('moves between tabs and pages, and tries again after an error', async () => {
    await signedInAs('admin');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/insurance/projects'
        ? ++calls > 1
          ? {
              body: pages(
                [
                  {
                    project: { id: PROJECT, name: 'Maize in Bogura' },
                    district: { code: 'BOGURA', name: 'Bogura' },
                    produceCode: 'MAIZE',
                    stage: 'active',
                    farmer: { id: 'f1', name: 'Karim Islam' },
                    insurer: null,
                    maxAmount: null,
                  },
                ],
                2,
              ),
            }
          : failure(500, 'X')
        : url.pathname === '/api/catalog'
          ? { body: catalog }
          : undefined,
    );
    const { router } = await renderPage(
      <InsuredProjectsList search={{}} />,
      '/insurance',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText(/Karim Islam/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Covered' }));
    expect(router.state.location.search).toEqual({ tab: 'covered' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'karim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'karim' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('sends officers and farmers on to the claims', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(() => undefined);
    const { router } = await renderPage(
      <InsuredProjectsList search={{}} />,
      '/insurance',
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/insurance/claims'),
    );
    expect(sent.some((s) => s.url.pathname === '/api/insurance/projects')).toBe(
      false,
    );
  });
});

describe('an insured project, further', () => {
  const at = (
    role: Parameters<typeof signedInAs>[0],
    c: CoverageDto | (() => Reply),
    write: (s: Sent) => Reply = () => ({ body: { data: coverage() } }),
    claims: ClaimDto[] = [],
  ) =>
    (async () => {
      await signedInAs(role);
      const sent = fakeServer((s) => {
        if (s.method !== 'GET') return write(s);
        if (s.url.pathname === `/api/insurance/projects/${PROJECT}/coverage`)
          return typeof c === 'function' ? c() : { body: { data: c } };
        if (s.url.pathname === '/api/insurance/claims')
          return { body: page(claims) };
        if (s.url.pathname === '/api/catalog') return { body: catalog };
        if (s.url.pathname === '/api/participants')
          return {
            body: page([{ id: 'ins-2', fullName: 'Pragati Insurance' }]),
          };
        return undefined;
      });
      await renderPage(
        <InsuredProjectPage projectId={PROJECT} />,
        `/insurance/projects/${PROJECT}`,
      );
      return sent;
    })();

  it('shows earlier cover and its claims, with nothing for the auditor to do', async () => {
    await at(
      'auditor',
      coverage({
        history: [
          {
            maxAmount: '20000.00',
            coveredEventTypes: [FLOOD],
            notes: null,
            termsHash: '0x0',
            status: 'superseded',
            recordedAt: '2026-10-01T00:00:00Z',
          },
        ] as never,
      }),
      undefined,
      [claim()],
    );
    expect(await screen.findByText('Earlier Cover')).toBeTruthy();
    expect(screen.getByText(/up to ৳ 20,000/)).toBeTruthy();
    expect(
      (await screen.findByRole('link', { name: /Flood/ })).getAttribute('href'),
    ).toBe(`/insurance/claims/${CLAIM}`);
    expect(screen.queryByText('Actions')).toBeNull();
  });

  it('keeps an insurer change with the reason when refused, and closes on Escape', async () => {
    const sent = await at('admin', coverage(), () =>
      failure(409, 'INSURER_FIXED'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change Insurer' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /Pragati Insurance/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Assign' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(writes(sent)[0]!.body).toEqual({ insurerId: 'ins-2' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('changes the cover from what it is, keeping it when refused', async () => {
    const sent = await at('insurer', coverage(), () =>
      failure(503, 'LEDGER_UNAVAILABLE'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change Cover' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      (within(dialog).getByLabelText('Maximum Cover') as HTMLInputElement)
        .value,
    ).toBe('30000');
    // Flood is covered now: choosing it again takes it off.
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Flood' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save Cover' }),
    );
    expect(
      await within(dialog).findByText(
        'The ledger cannot be reached right now. Try again shortly.',
      ),
    ).toBeTruthy();
    expect(writes(sent)[0]!.body).toMatchObject({
      coveredEventTypes: ['CYCLONE'],
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await at('admin', () =>
      ++calls > 1 ? { body: { data: coverage() } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Flood or cyclone')).toBeTruthy();
  });
});

describe('weather events, further', () => {
  it('searches and pages them, and tries again after an error', async () => {
    await signedInAs('farmer');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/insurance/weather-events'
        ? ++calls > 1
          ? { body: pages([event()], 2) }
          : failure(500, 'X')
        : undefined,
    );
    const { router } = await renderPage(
      <WeatherEventsList search={{}} />,
      '/insurance/weather-events',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText(/River above danger level/)).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox'), 'flood');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'flood' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('keeps an event with the reason when refused, and closes on Cancel or Escape', async () => {
    await signedInAs('insurer');
    fakeServer(({ method, url }) =>
      method === 'POST'
        ? failure(409, 'EVENT_EXISTS')
        : url.pathname === '/api/insurance/weather-events'
          ? { body: page([]) }
          : url.pathname === '/api/catalog'
            ? { body: catalog }
            : undefined,
    );
    await renderPage(
      <WeatherEventsList search={{}} />,
      '/insurance/weather-events',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Record Event/ }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('District'), 'bog');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Event Type' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Flood' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Severe/ }),
    );
    fireEvent.change(within(dialog).getByLabelText('Day It Happened'), {
      target: { value: '2026-10-15' },
    });
    await userEvent.type(
      within(dialog).getByLabelText('About the Event'),
      'High water',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Event' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Record Event/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('a project’s insurance at a glance', () => {
  it('shows nothing when uninsured, or to those without insurance', async () => {
    await signedInAs('investor');
    const sent = fakeServer(() => undefined);
    await renderPage(
      <ProjectInsurance project={project({ id: PROJECT, insured: true })} />,
      `/projects/${PROJECT}`,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
  });
});

describe('insurance, last details', () => {
  it('asks the claims of the tab shown', async () => {
    await signedInAs('insurer');
    const sent = fakeServer(() => ({ body: page([]) }));
    await renderPage(
      <ClaimsList search={{ tab: 'triggered' }} />,
      '/insurance/claims',
    );
    await screen.findByText('No claims here.');
    expect(sent[0]!.url.searchParams.get('status')).toBe('triggered');
  });

  it('shows an admin the project’s insurer and cover', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === `/api/insurance/projects/${PROJECT}/coverage`
        ? { body: { data: coverage() } }
        : undefined,
    );
    await renderPage(
      <ProjectInsurance project={project({ id: PROJECT, insured: true })} />,
      `/projects/${PROJECT}`,
    );
    expect(await screen.findByText(/Green Delta/)).toBeTruthy();
  });

  it('keeps a district name it does not know as given', async () => {
    await signedInAs('admin');
    const { result } = renderHook(() => useDistrictName());
    expect(result.current('Nowhere Upazila')).toBe('Nowhere Upazila');
    expect(result.current({ code: 'ZZ', name: 'Elsewhere' })).toBe('Elsewhere');
    expect(result.current(null)).toBe('');
    expect(result.current({ code: 'BOGURA', name: 'Bogra' })).toBe('Bogura');
  });
});
