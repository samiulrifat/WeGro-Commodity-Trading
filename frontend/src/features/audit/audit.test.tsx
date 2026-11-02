// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntryDto, HistoryEntryDto } from '@/api/generated/audit';
import { mayOpen } from '@/app/navigation';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { ActivityPage } from './activity-page';
import { ChecksPage } from './checks-page';
import { HistoryButton } from './history-button';
import { HistoryPage } from './history-page';
import { humanize, recordPage, shortId } from './audit-utils';
import {
  parseActivitySearch,
  parseHistorySearch,
  parseLogSearch,
} from './search';
import { LogPage } from './log-page';
import { SweepPage } from './sweep-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROJECT = '11111111-1111-4111-8111-111111111111';
const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
});

const entry = (over: Partial<HistoryEntryDto> = {}): HistoryEntryDto => ({
  at: '2026-10-26T05:00:00.000Z',
  blockNumber: 40,
  logIndex: 1,
  txHash: '0xabc',
  contract: 'ProjectLedger',
  event: 'ReservationConfirmed',
  title: 'Reservation paid and slots issued',
  actor: {
    kind: 'participant',
    address: '0x1',
    id: 'a1',
    name: 'Farhana Akter',
    role: 'accounts',
  },
  details: { projectId: PROJECT, slots: 5 },
  parties: {},
  ...over,
});

describe('ledger activity', () => {
  it('words each event, links the records it names, and filters by kind and number', async () => {
    await signedInAs('accounts');
    const activity: ActivityEntryDto = {
      ...entry(),
      records: [
        { type: 'project', id: PROJECT },
        { type: 'reservation', id: '7' },
      ],
    };
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/audit/events'
        ? { body: page([activity]) }
        : undefined,
    );
    await renderPage(
      <ActivityPage search={{ type: 'reservation', q: '7' }} />,
      '/audit',
    );
    expect(await screen.findByText('Booking Paid, Units Issued')).toBeTruthy();
    expect(screen.getByText('Farhana Akter (Accounts)')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Booking #7' }).getAttribute('href'),
    ).toBe('/audit/history/reservation/7');
    expect(
      screen
        .getByRole('link', { name: 'Project 11111111' })
        .getAttribute('href'),
    ).toBe(`/audit/history/project/${PROJECT}`);
    const params = sent.find((s) => s.url.pathname === '/api/audit/events')!.url
      .searchParams;
    expect(params.get('type')).toBe('reservation');
    expect(params.get('q')).toBe('7');
  });
});

describe('a record’s history', () => {
  const server = (mismatches: string[], onLedger = true) =>
    fakeServer(({ url }) => {
      if (url.pathname === `/api/audit/history/project/${PROJECT}`)
        return {
          body: page([
            entry(),
            entry({ event: 'ProjectCreated', logIndex: 0 }),
          ]),
        };
      if (url.pathname === `/api/audit/verify/project/${PROJECT}`)
        return {
          body: {
            data: {
              type: 'project',
              id: PROJECT,
              onLedger,
              matches: mismatches.length === 0,
              mismatches,
              checkedAt: '2026-10-26T06:00:00.000Z',
            },
          },
        };
      return undefined;
    });

  it('lists every event and says plainly what a check found', async () => {
    await signedInAs('auditor');
    server(['fingerprint', 'statusStored', 'somethingNew']);
    await renderPage(
      <HistoryPage type="project" id={PROJECT} search={{}} />,
      `/audit/history/project/${PROJECT}`,
    );
    expect(await screen.findByText('Project Created')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /Check Against the Ledger/ }),
    );
    expect(await screen.findByText('Does Not Match the Ledger')).toBeTruthy();
    expect(screen.getByText(/Contents \(fingerprint\)/)).toBeTruthy();
    expect(screen.getByText(/Status \(the saved copy\)/)).toBeTruthy();
    // A name the app has no words for still reads.
    expect(screen.getByText(/Something New/)).toBeTruthy();
  });

  it('says when a record matches, or is not on the ledger', async () => {
    await signedInAs('admin');
    server([]);
    await renderPage(
      <HistoryPage type="project" id={PROJECT} search={{}} />,
      `/audit/history/project/${PROJECT}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Check Against the Ledger/ }),
    );
    expect(await screen.findByText('Matches the Ledger')).toBeTruthy();
    cleanup();
    await signedInAs('admin');
    server([], false);
    await renderPage(
      <HistoryPage type="project" id={PROJECT} search={{}} />,
      `/audit/history/project/${PROJECT}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Check Against the Ledger/ }),
    );
    expect(await screen.findByText('Not on the Ledger')).toBeTruthy();
  });

  it('shows only the error when a check again fails', async () => {
    await signedInAs('admin');
    let calls = 0;
    fakeServer(({ url }) => {
      if (url.pathname === `/api/audit/history/project/${PROJECT}`)
        return { body: page([entry()]) };
      if (url.pathname === `/api/audit/verify/project/${PROJECT}`)
        return ++calls > 1
          ? {
              status: 503,
              body: {
                statusCode: 503,
                code: 'LEDGER_UNAVAILABLE',
                message: 'Ledger down',
              },
            }
          : {
              body: {
                data: {
                  type: 'project',
                  id: PROJECT,
                  onLedger: true,
                  matches: true,
                  mismatches: [],
                  checkedAt: '2026-10-26T06:00:00.000Z',
                },
              },
            };
      return undefined;
    });
    await renderPage(
      <HistoryPage type="project" id={PROJECT} search={{}} />,
      `/audit/history/project/${PROJECT}`,
    );
    const check = await screen.findByRole('button', {
      name: /Check Against the Ledger/,
    });
    await userEvent.click(check);
    expect(await screen.findByText('Matches the Ledger')).toBeTruthy();
    await userEvent.click(check);
    expect(
      await screen.findByText(
        'The ledger cannot be reached right now. Try again shortly.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Matches the Ledger')).toBeNull();
  });

  it('shows Accounts the history without the check', async () => {
    await signedInAs('accounts');
    server([]);
    await renderPage(
      <HistoryPage type="project" id={PROJECT} search={{}} />,
      `/audit/history/project/${PROJECT}`,
    );
    expect(await screen.findByText('Project Created')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Check Against the Ledger/ }),
    ).toBeNull();
  });
});

describe('checks and the request log', () => {
  const sweep = {
    id: '22222222-2222-4222-8222-222222222222',
    status: 'done',
    startedAt: '2026-10-26T05:00:00.000Z',
    finishedAt: '2026-10-26T05:01:00.000Z',
    startedBy: { id: 'u1', name: 'Demo Auditor' },
    checked: 340,
    mismatched: 2,
    error: null,
  };

  it('lets an auditor start a sweep, and says how each ended', async () => {
    await signedInAs('auditor');
    const sent = fakeServer(({ method, url }) =>
      url.pathname === '/api/audit/sweeps'
        ? method === 'POST'
          ? { status: 202, body: { data: { ...sweep, status: 'running' } } }
          : { body: { data: [sweep] } }
        : undefined,
    );
    await renderPage(<ChecksPage />, '/audit/checks');
    expect(await screen.findByText('2 Differ')).toBeTruthy();
    expect(screen.getByText(/340 records checked/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Every Record' }),
    );
    await waitFor(() =>
      expect(sent.some((s) => s.method === 'POST')).toBe(true),
    );
  });

  it('does not offer admins a sweep (the API allows the super admin and auditors)', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/audit/sweeps'
        ? { body: { data: [sweep] } }
        : undefined,
    );
    await renderPage(<ChecksPage />, '/audit/checks');
    expect(await screen.findByText('2 Differ')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Check Every Record' }),
    ).toBeNull();
  });

  it('lists write requests with their result, and filters by route', async () => {
    await signedInAs('super_admin');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/audit/log'
        ? {
            body: page([
              {
                id: 5,
                at: '2026-10-26T05:00:00.000Z',
                actor: { id: 'a1', name: 'Demo Admin', role: 'admin' },
                method: 'POST',
                route: '/api/projects/:id/publish',
                params: { id: PROJECT },
                statusCode: 403,
                outcome: 'failed',
                requestId: 'r1',
                durationMs: 12,
              },
            ]),
          }
        : undefined,
    );
    await renderPage(
      <LogPage search={{ q: 'api/projects', outcome: 'failed' }} />,
      '/audit/log',
    );
    const row = (
      await screen.findByText(/POST \/api\/projects\/:id\/publish/)
    ).closest('div')!.parentElement!;
    expect(within(row).getByText(/Refused · 403/)).toBeTruthy();
    const params = sent.find((s) => s.url.pathname === '/api/audit/log')!.url
      .searchParams;
    // A route typed without its slash still finds it.
    expect(params.get('route')).toBe('/api/projects');
    expect(params.get('outcome')).toBe('failed');
  });
});

describe('who reaches history', () => {
  const user = (role: string) =>
    ({ id: 'me', role, status: 'verified' }) as never;

  it('follows each role’s pages', () => {
    for (const role of [
      'super_admin',
      'admin',
      'auditor',
      'operations',
      'accounts',
    ])
      expect(mayOpen(user(role), `/audit/history/project/${PROJECT}`)).toBe(
        true,
      );
    expect(mayOpen(user('farmer'), `/audit/history/project/${PROJECT}`)).toBe(
      false,
    );
    // Ledger checks: not for Operations or Accounts; the log: not for admins.
    expect(mayOpen(user('accounts'), '/audit/checks')).toBe(false);
    expect(mayOpen(user('admin'), '/audit/checks')).toBe(true);
    expect(mayOpen(user('admin'), '/audit/log')).toBe(false);
    expect(mayOpen(user('auditor'), '/audit/log')).toBe(true);
  });

  it('shows History on a record only to those', async () => {
    await signedInAs('operations');
    await renderPage(<HistoryButton type="voucher" id="v1" />, '/vouchers/v1');
    expect(
      screen.getByRole('link', { name: 'History' }).getAttribute('href'),
    ).toBe('/audit/history/voucher/v1');
    cleanup();
    await signedInAs('farmer');
    await renderPage(<HistoryButton type="voucher" id="v1" />, '/vouchers/v1');
    expect(screen.queryByRole('link', { name: 'History' })).toBeNull();
  });
});

const failure = {
  status: 500,
  body: { statusCode: 500, code: 'X', message: 'x' },
};
const pages = <T,>(data: T[], totalPages: number) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages },
});

describe('audit helpers', () => {
  it('knows each record’s own page, and reads ids and names as people do', () => {
    const pagesBy: Record<string, string | null> = {
      participant: '/people/x',
      project: '/projects/x',
      voucher: '/vouchers/x',
      batch: '/vouchers/batches/x',
      'voucher-sale': '/vouchers/sales',
      'warehouse-site': '/warehouse/sites',
      receipt: '/warehouse/receipts/x',
      listing: '/marketplace/listings/x',
      offer: '/marketplace/deals/x',
      'buyer-request': '/marketplace/requests',
      'weather-event': '/insurance/weather-events',
      claim: '/insurance/claims/x',
      round: '/payouts/rounds/x',
      cost: '/payouts/costs',
      bank: '/track-records/banks',
      'track-record': '/track-records/farmers/x',
      unknown: null,
    };
    for (const [type, path] of Object.entries(pagesBy))
      expect(recordPage(type, 'x')).toBe(path);
    expect(shortId('round', '12')).toBe('#12');
    expect(shortId('receipt', '0x1234567890abcdef')).toBe('0x12345678…');
    expect(shortId('project', PROJECT)).toBe('11111111');
    expect(humanize('SlotsReserved')).toBe('Slots Reserved');
  });

  it('keeps only what each page understands from the address', () => {
    expect(
      parseActivitySearch({ type: 'project', q: ' 12 ', page: '3' }),
    ).toEqual({
      type: 'project',
      q: ' 12 ',
      page: 3,
    });
    expect(parseActivitySearch({ type: 'nope', q: '  ', page: '1' })).toEqual({
      type: undefined,
      q: undefined,
      page: undefined,
    });
    expect(parseHistorySearch({ order: 'desc', page: '2' })).toEqual({
      order: 'desc',
      page: 2,
    });
    expect(parseHistorySearch({ order: 'sideways' })).toEqual({
      order: undefined,
      page: undefined,
    });
    expect(
      parseLogSearch({
        q: '/api/x',
        outcome: 'failed',
        from: '2026-10-01',
        to: 'yesterday',
        actorId: PROJECT,
        actorName: 'Demo Admin',
        page: 'x',
      }),
    ).toEqual({
      q: '/api/x',
      outcome: 'failed',
      from: '2026-10-01',
      to: undefined,
      actorId: PROJECT,
      actorName: 'Demo Admin',
      page: undefined,
    });
    expect(parseLogSearch({ actorId: 'not-an-id' }).actorId).toBeUndefined();
    expect(humanize('weather-event')).toBe('Weather event');
  });
});

describe('ledger activity, further', () => {
  it('filters by kind of record, searches, pages, and tries again after an error', async () => {
    await signedInAs('auditor');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/audit/events'
        ? ++calls > 1
          ? {
              body: pages(
                [
                  {
                    ...entry({
                      details: {
                        list: ['a', 'b'],
                        none: null,
                        nested: { x: 1 },
                      },
                    }),
                    records: [{ type: 'project', id: PROJECT }],
                  } as ActivityEntryDto,
                ],
                2,
              ),
            }
          : failure
        : undefined,
    );
    const { router } = await renderPage(<ActivityPage search={{}} />, '/audit');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('a, b')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('{"x":1}')).toBeTruthy();
    await userEvent.click(screen.getByRole('combobox', { name: 'Record' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Project' }),
    );
    expect(router.state.location.search).toEqual({ type: 'project' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Record' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'All Records' }),
    );
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: '12' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });
});

describe('a record’s history, further', () => {
  it('turns the order around, pages, and tries again after an error', async () => {
    await signedInAs('auditor');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === `/api/audit/history/project/${PROJECT}`
        ? ++calls > 1
          ? { body: pages([entry()], 2) }
          : failure
        : undefined,
    );
    const { router } = await renderPage(
      <HistoryPage type="project" id={PROJECT} search={{}} />,
      `/audit/history/project/${PROJECT}`,
    );
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Try Again/ }))[0]!,
    );
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Newest First' }),
    );
    expect(router.state.location.search).toEqual({ order: 'desc' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toMatchObject({ page: 2 });
  });
});

describe('checks, further', () => {
  const sweep = (over = {}) => ({
    id: '22222222-2222-4222-8222-222222222222',
    status: 'done',
    startedAt: '2026-10-26T05:00:00.000Z',
    finishedAt: '2026-10-26T05:01:00.000Z',
    startedBy: { id: 'u1', name: 'Demo Auditor' },
    checked: 340,
    mismatched: 0,
    error: null,
    ...over,
  });

  it('says how each check stands, why one could not start, and tries again', async () => {
    await signedInAs('auditor');
    let calls = 0;
    fakeServer(({ method, url }) => {
      if (method === 'POST')
        return {
          status: 409,
          body: { statusCode: 409, code: 'SWEEP_RUNNING', message: 'x' },
        };
      if (url.pathname === '/api/audit/sweeps')
        return ++calls === 1
          ? failure
          : {
              body: {
                data: [
                  sweep({ id: 'a', status: 'running', finishedAt: null }),
                  sweep({ id: 'b', status: 'failed' }),
                  sweep({ id: 'c' }),
                ],
              },
            };
      return undefined;
    });
    await renderPage(<ChecksPage />, '/audit/checks');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Running')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('All Match')).toBeTruthy();
    // One is running: no second one meanwhile.
    expect(
      screen.getByRole('button', { name: /Checking/ }).hasAttribute('disabled'),
    ).toBe(true);
    cleanup();
    fakeServer(({ method }) =>
      method === 'POST'
        ? {
            status: 409,
            body: { statusCode: 409, code: 'SWEEP_RUNNING', message: 'x' },
          }
        : { body: { data: [sweep()] } },
    );
    await renderPage(<ChecksPage />, '/audit/checks');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Check Every Record' }),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('shows a check’s findings, linked where there is a history, and tries again', async () => {
    await signedInAs('auditor');
    let calls = 0;
    const id = '22222222-2222-4222-8222-222222222222';
    fakeServer(({ url }) => {
      if (url.pathname === `/api/audit/sweeps/${id}`)
        return ++calls === 1
          ? failure
          : { body: { data: sweep({ mismatched: 2 }) } };
      if (url.pathname === `/api/audit/sweeps/${id}/findings`)
        return {
          body: pages(
            [
              { type: 'project', recordId: PROJECT, mismatches: ['farmer'] },
              { type: 'mystery', recordId: '42', mismatches: ['x'] },
            ],
            1,
          ),
        };
      return undefined;
    });
    await renderPage(<SweepPage id={id} />, `/audit/checks/${id}`);
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Records That Differ')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /11111111/ }).getAttribute('href'),
    ).toBe(`/audit/history/project/${PROJECT}`);
    expect(screen.getByText(/#42/)).toBeTruthy();
  });

  it('says when a check found nothing different', async () => {
    await signedInAs('auditor');
    const id = '33333333-3333-4333-8333-333333333333';
    fakeServer(({ url }) =>
      url.pathname === `/api/audit/sweeps/${id}`
        ? { body: { data: sweep({ id }) } }
        : { body: pages([], 1) },
    );
    await renderPage(<SweepPage id={id} />, `/audit/checks/${id}`);
    expect(
      await screen.findByText('Every record checked matches the ledger.'),
    ).toBeTruthy();
  });
});

describe('the request log, further', () => {
  it('filters by result, days and person, pages, and tries again after an error', async () => {
    await signedInAs('super_admin');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/audit/log'
        ? ++calls > 1
          ? {
              body: pages(
                [
                  {
                    id: 6,
                    at: '2026-10-26T05:00:00.000Z',
                    actor: { id: 'a1', name: 'Demo Admin', role: 'admin' },
                    method: 'PATCH',
                    route: '/api/projects/:id',
                    params: {},
                    statusCode: 200,
                    outcome: 'ok',
                    requestId: 'r2',
                    durationMs: 8,
                  },
                ],
                2,
              ),
            }
          : failure
        : undefined,
    );
    const { router } = await renderPage(<LogPage search={{}} />, '/audit/log');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Demo Admin/ }),
    );
    expect(router.state.location.search).toEqual({
      actorId: 'a1',
      actorName: 'Demo Admin',
    });
    await userEvent.click(screen.getByRole('combobox', { name: 'Result' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Refused' }),
    );
    expect(router.state.location.search).toMatchObject({ outcome: 'failed' });
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-10-31' },
    });
    expect(router.state.location.search).toMatchObject({ to: '2026-10-31' });
    await userEvent.type(screen.getByRole('searchbox'), '/api/x');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toMatchObject({ page: 2 });
    cleanup();

    fakeServer(() => ({ body: pages([], 1) }));
    const second = await renderPage(
      <LogPage search={{ actorId: 'a1', actorName: 'Demo Admin' }} />,
      '/audit/log',
    );
    expect(await screen.findByText('Only Demo Admin')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /Show Everyone/ }),
    );
    expect(second.router.state.location.search).toEqual({});
  });
});
