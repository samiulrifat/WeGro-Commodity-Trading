// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntryDto, HistoryEntryDto } from '@/api/generated/audit';
import { mayOpen } from '@/app/navigation';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { ActivityPage } from './activity-page';
import { ChecksPage } from './checks-page';
import { HistoryButton } from './history-button';
import { HistoryPage } from './history-page';
import { LogPage } from './log-page';

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
