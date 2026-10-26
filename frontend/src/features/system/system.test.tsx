// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobStatusDto, SystemStatusDto } from '@/api/generated/jobs';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { JobRunsPage } from './job-runs-page';
import { JobsPage } from './jobs-page';
import { StatusPage } from './status-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date().toISOString();

const status = (over: Partial<SystemStatusDto> = {}): SystemStatusDto => ({
  status: 'ok',
  checkedAt: NOW,
  database: 'up',
  chain: {
    status: 'up',
    chainId: 31337,
    blockNumber: 282,
    ledgerTime: NOW,
  },
  indexer: {
    enabled: true,
    running: true,
    indexedBlock: 281,
    behind: 0,
    allowedBehind: 100,
    confirmations: 1,
    failures: 0,
    lastError: null,
  },
  incident: null,
  uptimeSeconds: 3 * 3600 + 25 * 60,
  ...over,
});

const serveStatus = (s: SystemStatusDto) =>
  fakeServer(({ url }) =>
    url.pathname === '/api/system/status' ? { body: { data: s } } : undefined,
  );

describe('system status', () => {
  it('says all is well, with each part', async () => {
    await signedInAs('super_admin');
    serveStatus(status());
    await renderPage(<StatusPage />, '/system');
    expect(await screen.findByText('All Well')).toBeTruthy();
    expect(screen.getByText('In step with the ledger.')).toBeTruthy();
    expect(
      screen.getByText('Answering: block 282 on chain 31337.'),
    ).toBeTruthy();
    expect(
      screen.getByText('The server has been running for 3 hours 25 minutes.'),
    ).toBeTruthy();
  });

  it('leads with what needs attention, and notes a ledger clock moved forward', async () => {
    await signedInAs('admin');
    serveStatus(
      status({
        status: 'degraded',
        chain: {
          status: 'up',
          chainId: 31337,
          blockNumber: 900,
          ledgerTime: new Date(
            Date.now() + 90 * 86_400_000 + 7_200_000,
          ).toISOString(),
        },
        indexer: {
          ...status().indexer,
          behind: 240,
          failures: 2,
          lastError: 'connection reset',
        },
        incident: { problem: 'indexer-behind', since: NOW },
      }),
    );
    await renderPage(<StatusPage />, '/system');
    expect(await screen.findByText('Needs Attention')).toBeTruthy();
    expect(
      screen.getByText(/The database is falling behind the ledger, since/),
    ).toBeTruthy();
    expect(
      screen.getByText('240 blocks behind the ledger (up to 100 is fine).'),
    ).toBeTruthy();
    expect(screen.getByText(/The last 2 copying passes failed/)).toBeTruthy();
    expect(screen.getByText('connection reset')).toBeTruthy();
    expect(screen.getByText(/90 days 2 hours ahead of real time/)).toBeTruthy();
  });

  it('says plainly when the database is down', async () => {
    await signedInAs('auditor');
    serveStatus(status({ status: 'down', database: 'down' }));
    await renderPage(<StatusPage />, '/system');
    expect(await screen.findByText('The Database Is Down')).toBeTruthy();
  });
});

describe('scheduled jobs', () => {
  const job = (over: Partial<JobStatusDto> = {}): JobStatusDto => ({
    name: 'reservation-expiry',
    description: 'Releases unpaid reservations past their deadline',
    everyMs: 60_000,
    enabled: true,
    running: false,
    lastRun: {
      trigger: 'schedule',
      triggeredBy: null,
      startedAt: NOW,
      finishedAt: NOW,
      outcome: 'ok',
      items: 2,
      error: null,
    },
    nextRunAt: NOW,
    ...over,
  });

  it('words each job, and lets the super admin run one now', async () => {
    await signedInAs('super_admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/jobs')
        return {
          body: {
            data: [
              job(),
              job({
                name: 'reminders',
                everyMs: 300_000,
                lastRun: null,
              }),
              job({ name: 'brand-new', description: 'Does a new thing' }),
            ],
          },
        };
      if (method === 'POST' && url.pathname === '/api/jobs/reminders/run')
        return {
          body: {
            data: {
              ...job().lastRun,
              trigger: 'manual',
              triggeredBy: { id: 'u1', name: 'Super Admin' },
              items: 4,
            },
          },
        };
      return undefined;
    });
    await renderPage(<JobsPage />, '/system/jobs');
    expect(await screen.findByText('Lapse Unpaid Bookings')).toBeTruthy();
    expect(screen.getByText('Every 5 minutes')).toBeTruthy();
    expect(screen.getByText('Not since the server started.')).toBeTruthy();
    expect(
      screen.getAllByText(/2 items · .* · on schedule/).length,
    ).toBeGreaterThan(0);
    // A job the app has no words for keeps its name and the server's English.
    expect(screen.getByText('brand-new')).toBeTruthy();
    expect(screen.getByText('Does a new thing')).toBeTruthy();

    const runs = screen.getAllByRole('button', { name: 'Run Now' });
    expect(runs).toHaveLength(3);
    await userEvent.click(runs[1]!);
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.method === 'POST' && s.url.pathname === '/api/jobs/reminders/run',
        ),
      ).toBe(true),
    );
  });

  it('shows admins the jobs without Run Now, and a job’s past runs', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) => {
      if (url.pathname === '/api/jobs') return { body: { data: [job()] } };
      if (url.pathname === '/api/jobs/reservation-expiry/runs')
        return {
          body: {
            data: [
              {
                ...job().lastRun,
                trigger: 'manual',
                triggeredBy: { id: 'u1', name: 'Super Admin' },
                outcome: 'failed',
                error: 'node unreachable',
              },
            ],
            meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          },
        };
      return undefined;
    });
    await renderPage(<JobsPage />, '/system/jobs');
    expect(await screen.findByText('Lapse Unpaid Bookings')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run Now' })).toBeNull();
    cleanup();
    await signedInAs('admin');
    fakeServer(({ url }) => {
      if (url.pathname === '/api/jobs') return { body: { data: [job()] } };
      if (url.pathname === '/api/jobs/reservation-expiry/runs')
        return {
          body: {
            data: [
              {
                ...job().lastRun,
                trigger: 'manual',
                triggeredBy: { id: 'u1', name: 'Super Admin' },
                outcome: 'failed',
                error: 'node unreachable',
              },
            ],
            meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          },
        };
      return undefined;
    });
    await renderPage(
      <JobRunsPage name="reservation-expiry" />,
      '/system/jobs/reservation-expiry',
    );
    expect(await screen.findByText('Failed')).toBeTruthy();
    expect(screen.getByText(/run by Super Admin/)).toBeTruthy();
    expect(screen.getByText('node unreachable')).toBeTruthy();
  });
});
