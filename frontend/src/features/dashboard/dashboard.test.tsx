// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardDto, QueueDto } from '@/api/generated/dashboard';
import { mayOpen } from '@/app/navigation';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { niceMax } from './chart-utils';
import { DashboardPage } from './dashboard-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const months = Array.from(
  { length: 12 },
  (_, i) => `2026-${String(i + 1).padStart(2, '0')}`,
);
const zeros = months.map(() => '0.00');

const queue = (over: Partial<QueueDto>): QueueDto => ({
  key: 'offers.pending',
  title: 'Offers awaiting approval',
  actionBy: 'admin',
  count: 0,
  oldest: [],
  ...over,
});

const dashboard = (queues: QueueDto[]): DashboardDto => ({
  asOf: '2026-10-26T05:00:00.000Z',
  funding: {
    openProjects: 1,
    target: '50000.00',
    raised: '20000.00',
    percentFunded: '40.0',
    projects: [
      {
        project: { id: 'p1', name: 'Wheat in Bogura #2' },
        farmer: { id: 'f1', name: 'Hasina Uddin' },
        produceCode: 'WHEAT',
        districtCode: 'BOGURA',
        target: '50000.00',
        raised: '20000.00',
        percentFunded: '40.0',
        totalSlots: 5,
        issuedSlots: 2,
        reservedSlots: 1,
        pendingReservations: 1,
        publishedAt: '2026-08-01T00:00:00.000Z',
        daysOpen: 90,
      },
    ],
  },
  stages: { open_for_funding: 1, active: 4 },
  active: { count: 0, projects: [] },
  queues,
  figures: {
    fundingRaised: '370000.00',
    refunded: '0.00',
    salesIncome: '135000.00',
    insuranceApproved: '0.00',
    inputsSpent: '3000.00',
    payoutsPaid: '156800.00',
    participants: { farmer: 11, investor: 21 },
  },
  trends: {
    months,
    fundingRaised: zeros.map((z, i) => (i === 11 ? '370000.00' : z)),
    salesIncome: zeros,
    payoutsPaid: zeros,
    projectsStarted: months.map(() => 0),
    projectsFinished: months.map(() => 0),
  },
  figuresAsOf: '2026-10-26T05:00:00.000Z',
});

const serve = (d: DashboardDto) =>
  fakeServer(({ url }) =>
    url.pathname === '/api/dashboard' ? { body: { data: d } } : undefined,
  );

describe('dashboard', () => {
  it('leads with the work: queues worded from their values, linked, the empty ones on one line', async () => {
    await signedInAs('admin');
    serve(
      dashboard([
        queue({
          count: 3,
          urgent: {},
          oldest: [
            {
              id: '4',
              title: 'Offer #4 on listing #2',
              detail: null,
              person: { id: 'b1', name: 'Mizan Khatun' },
              project: { id: 'p6', name: 'Tomato in Rangpur #6' },
              since: '2026-10-26T04:00:00.000Z',
              params: {
                id: 4,
                listing: 2,
                quantity: '200',
                produce: 'TOMATO',
                unitPrice: '41.00',
              },
            },
          ],
        }),
        queue({
          key: 'deals.awaiting-payment',
          count: 1,
          urgent: { overdue: 1 },
          oldest: [
            {
              id: '3',
              title: 'Deal #3',
              detail: null,
              person: null,
              project: null,
              since: '2026-10-27T04:00:00.000Z',
              params: { id: 3, quantity: '300', produce: 'TOMATO' },
            },
          ],
        }),
        queue({ key: 'claims.open', count: 0 }),
        queue({ key: 'rounds.unpaid', count: 0 }),
      ]),
    );
    await renderPage(<DashboardPage />, '/dashboard');
    const waiting = (await screen.findByText('Waiting for You')).closest(
      'section',
    )!;
    // Worded by the app (catalog names once loaded; codes stand in here).
    const offer = within(waiting).getByRole('link', {
      name: /^Offer #4: 200 TOMATO at ৳\s?41$/,
    });
    expect(offer.getAttribute('href')).toBe('/marketplace/deals/4');
    expect(within(waiting).getByText('1 Overdue')).toBeTruthy();
    expect(within(waiting).getByText(/^due /)).toBeTruthy();
    expect(
      within(waiting)
        .getAllByRole('link', { name: /Open the List/ })[0]!
        .getAttribute('href'),
    ).toBe('/marketplace/deals?tab=pending');
    expect(
      within(waiting).getByRole('link', { name: /Open the List \(2 more\)/ }),
    ).toBeTruthy();
    expect(
      within(waiting).getByText(
        'Open Insurance Claims · Approved Rounds With Unpaid Lines',
      ),
    ).toBeTruthy();
    // Headline tiles: 4 items waiting across the queues.
    expect(screen.getByText('Items Waiting').previousSibling?.textContent).toBe(
      '4',
    );
  });

  it('says so when nothing is waiting, and shows funding, stages, figures and trends', async () => {
    await signedInAs('accounts');
    serve(dashboard([queue({ key: 'rounds.unpaid' })]));
    await renderPage(<DashboardPage />, '/dashboard');
    expect(
      await screen.findByText('Nothing is waiting. Every queue is clear.'),
    ).toBeTruthy();
    expect(screen.getByText('Wheat in Bogura #2')).toBeTruthy();
    expect(screen.getByText('1 Payment to Confirm')).toBeTruthy();
    expect(screen.getByText('In the Field').previousSibling?.textContent).toBe(
      '4',
    );
    expect(screen.getByText(/^৳\s?370K$/)).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
    // Each chart has its figures as a table too.
    const funding = screen
      .getAllByText('Funding Raised')
      .map((el) => el.closest('figure'))
      .find(Boolean)!;
    expect(within(funding).getByText(/^৳\s?370,000 in all$/)).toBeTruthy();
    expect(within(funding).getAllByRole('row')).toHaveLength(12);
  });
});

describe('links only where the role may go', () => {
  const user = (role: 'admin' | 'accounts' | 'operations') =>
    ({ role, status: 'verified' }) as never;

  it('follows the menu: section, then its pages', () => {
    expect(mayOpen(user('admin'), '/people/abc')).toBe(true);
    expect(mayOpen(user('accounts'), '/people/abc')).toBe(false);
    expect(mayOpen(user('accounts'), '/payouts/rounds/4')).toBe(true);
    expect(mayOpen(user('operations'), '/payouts/rounds/4')).toBe(false);
    expect(mayOpen(user('operations'), '/projects/p1')).toBe(true);
    expect(mayOpen(user('operations'), '/marketplace/deals/4')).toBe(true);
  });
});

describe('chart axis', () => {
  it('tops out at 1, 2 or 5 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(370000)).toBe(500000);
    expect(niceMax(156800)).toBe(200000);
    expect(niceMax(5)).toBe(5);
    expect(niceMax(7)).toBe(10);
  });
});
