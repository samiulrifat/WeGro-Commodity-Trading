// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardDto, QueueItemDto } from '@/api/generated/dashboard';
import { applyLanguage } from '@/i18n';
import { store } from '@/store/store';
import { fakeServer, type Reply, renderPage, signedInAs } from '@/test/render';
import { DashboardPage } from './dashboard-page';
import { useItemText } from './item-text';
import { itemPath, QUEUE_LIST, type QueueKey } from './queues';
import { TrendChart } from './trend-chart';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const catalog: Reply = {
  body: {
    data: {
      version: '1',
      units: [
        {
          code: 'KG',
          name: 'Kilogram',
          nameBn: 'কিলোগ্রাম',
          symbol: 'kg',
          symbolBn: 'কেজি',
          kind: 'mass',
          active: true,
          sortOrder: 1,
        },
      ],
      produceTypes: [
        {
          code: 'MAIZE',
          name: 'Maize',
          nameBn: 'ভুট্টা',
          unitCode: 'KG',
          category: 'storable_crop',
          active: true,
          sortOrder: 1,
        },
      ],
      inputTypes: [
        {
          code: 'UREA',
          name: 'Urea',
          nameBn: 'ইউরিয়া',
          unitCode: 'KG',
          kind: 'fertilizer',
          active: true,
          sortOrder: 1,
        },
      ],
      fieldRecordTypes: [],
      weatherEventTypes: [],
      districts: [],
    },
  },
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

async function words() {
  await signedInAs('admin');
  fakeServer(({ url }) =>
    url.pathname === '/api/catalog' ? catalog : undefined,
  );
  const { result } = renderHook(() => useItemText(), { wrapper });
  // Names and units come once the catalog is in.
  await waitFor(() =>
    expect(
      result.current('vouchers.proposed', {
        input: 'UREA',
        quantity: '5',
        value: '1',
      }),
    ).toContain('kg'),
  );
  // Amounts keep a no-break space after ৳: compared as a plain one.
  return (key: QueueKey, params: QueueItemDto['params']) =>
    result.current(key, params).replace(/\s/g, ' ');
}

describe('waiting items in words', () => {
  it('words each queue from its values, with names and units from the catalog', async () => {
    const say = await words();
    expect(say('participants.pending', { role: 'farmer' })).toBe(
      'Registration as Farmer',
    );
    expect(say('participants.pending', { role: 'astronaut' })).toBe(
      'Registration as astronaut',
    );
    expect(say('bank-accounts.pending', { change: true })).toBe(
      'Changed bank details',
    );
    expect(say('bank-accounts.pending', { change: false })).toBe(
      'New bank details',
    );
    expect(say('reservations.pending', { id: 4, slots: 2 })).toBe(
      'Booking #4: 2 units',
    );
    expect(say('payment-proofs.pending', { id: 4, amount: '5000.00' })).toMatch(
      /^Booking #4: .*5,000.* sent$/,
    );
    expect(say('deal-proofs.pending', { id: 9, amount: '250.50' })).toMatch(
      /^Deal #9: .*250\.50.* sent$/,
    );
    expect(
      say('vouchers.proposed', {
        input: 'UREA',
        quantity: '100',
        value: '2750.00',
      }),
    ).toBe('Voucher for 100 kg Urea, worth ৳ 2,750');
    expect(
      say('voucher-sales.pending', { id: 7, input: 'UREA', quantity: '10' }),
    ).toBe('Input sale #7: 10 kg Urea');
    expect(
      say('vouchers.inactive', { input: 'SEED', quantity: '3', days: 1 }),
    ).toBe('Voucher for 3 SEED: unused for 1 day');
    expect(
      say('offers.pending', {
        id: 12,
        produce: 'MAIZE',
        quantity: '2000',
        unitPrice: '31.00',
      }),
    ).toBe('Offer #12: 2,000 kg Maize at ৳ 31/kg');
    expect(
      say('offers.pending', {
        id: 13,
        produce: 'JUTE',
        quantity: '5',
        unitPrice: '9',
      }),
    ).toBe('Offer #13: 5 JUTE at ৳ 9');
    expect(
      say('deals.awaiting-payment', {
        id: 3,
        produce: 'MAIZE',
        quantity: '20',
      }),
    ).toBe('Deal #3: 20 kg Maize');
    expect(
      say('deliveries.discrepancy', {
        id: 3,
        produce: 'MAIZE',
        quantity: '20',
        buyer: '18',
        handler: null,
      }),
    ).toBe('Deal #3: 20 kg sold; buyer confirmed 18 kg, handler nothing yet');
    expect(
      say('handovers.pending', {
        receipt: 'WR-1',
        produce: 'MAIZE',
        quantity: '9',
      }),
    ).toBe('Receipt WR-1…: 9 kg Maize');
    expect(
      say('rounds.awaiting-approval', { id: 7, final: true, payees: 3 }),
    ).toBe('Final round #7 for 3 payees');
    expect(
      say('rounds.awaiting-approval', { id: 8, final: false, payees: 1 }),
    ).toBe('Staged round #8 for 1 payee');
    expect(say('rounds.unpaid', { id: 7, paid: 1, payees: 3 })).toBe(
      'Round #7: 1 of 3 paid',
    );
    expect(say('projects.ready-for-settlement', { produce: 'MAIZE' })).toBe(
      'Final payout due (Maize)',
    );
    expect(say('claims.open', { status: 'triggered', damage: '40.5' })).toBe(
      'Claim, New: 40.5% damage',
    );
    expect(say('claims.open', { status: 'strange', damage: '12' })).toBe(
      'Claim, strange: 12% damage',
    );
    expect(say('claims.payment-due', { amount: '15000.00' })).toBe(
      'Approved claim of ৳ 15,000',
    );
  });

  it('uses the Bengali names and symbols', async () => {
    await signedInAs('admin');
    await applyLanguage('bn');
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? catalog : undefined,
    );
    const { result } = renderHook(() => useItemText(), { wrapper });
    await waitFor(() =>
      expect(
        result.current('handovers.pending', {
          receipt: 'WR',
          produce: 'MAIZE',
          quantity: '1',
        }),
      ).toContain('ভুট্টা'),
    );
    expect(
      result.current('voucher-sales.pending', {
        id: 1,
        input: 'UREA',
        quantity: '1',
      }),
    ).toContain('কেজি');
    await applyLanguage('en');
  });
});

describe('where a waiting item opens', () => {
  const item = (over: Partial<QueueItemDto> = {}): QueueItemDto => ({
    id: 'x1',
    title: '',
    since: '2026-10-01T00:00:00Z',
    params: {},
    ...over,
  });

  it('opens the record the work is on', () => {
    const person = { id: 'u1', name: 'R' };
    const project = { id: 'p1', name: 'P' };
    expect(itemPath('participants.pending', item({ person }))).toBe(
      '/people/u1',
    );
    expect(itemPath('bank-accounts.pending', item())).toBeNull();
    expect(itemPath('reservations.pending', item({ project }))).toBe(
      '/projects/p1',
    );
    expect(itemPath('payment-proofs.pending', item({ project }))).toBe(
      '/projects/payments',
    );
    expect(itemPath('deal-proofs.pending', item())).toBe(
      '/marketplace/payments',
    );
    // Each queue opens the list its number counts.
    expect(QUEUE_LIST['payment-proofs.pending']).toEqual({
      to: '/projects/payments',
    });
    expect(QUEUE_LIST['reservations.pending']).toEqual({
      to: '/projects/payments',
      search: { tab: 'bookings' },
    });
    expect(QUEUE_LIST['deal-proofs.pending']).toEqual({
      to: '/marketplace/payments',
    });
    expect(QUEUE_LIST['deals.awaiting-payment']).toEqual({
      to: '/marketplace/payments',
      search: { tab: 'deals' },
    });
    expect(itemPath('voucher-sales.pending', item())).toBeNull();
    expect(itemPath('vouchers.inactive', item())).toBe('/vouchers/x1');
    expect(itemPath('deliveries.discrepancy', item())).toBe(
      '/marketplace/deals/x1',
    );
    expect(itemPath('handovers.pending', item())).toBe(
      '/warehouse/receipts/x1',
    );
    expect(itemPath('rounds.unpaid', item())).toBe('/payouts/rounds/x1');
    expect(itemPath('projects.ready-for-settlement', item())).toBe(
      '/payouts/projects/x1',
    );
    expect(itemPath('claims.payment-due', item())).toBe('/insurance/claims/x1');
  });
});

describe('a trend chart', () => {
  it('follows its width, and points out the month under the pointer', async () => {
    let resized: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          resized = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    await signedInAs('admin');
    const { unmount, container } = render(
      <Provider store={store}>
        <TrendChart
          title="Funding Raised"
          months={['2026-09', '2026-10']}
          values={[1000, 2500]}
          format={(v) => `৳ ${v}`}
          tick={(v) => String(v)}
          month={(m) => m.slice(5)}
          monthLong={(m) => `Month ${m}`}
        />
      </Provider>,
    );
    act(() =>
      resized(
        [{ contentRect: { width: 640 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      ),
    );
    const bands = container.querySelectorAll('rect[fill="transparent"]');
    expect(bands).toHaveLength(2);
    fireEvent.mouseEnter(bands[0]!);
    expect(screen.getAllByText(/Month 2026-09/).length).toBeGreaterThan(0);
    fireEvent.mouseLeave(bands[0]!);
    fireEvent.click(bands[1]!);
    expect(screen.getAllByText(/৳ 2500/).length).toBeGreaterThan(0);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('the dashboard, further', () => {
  const dashboard = (over: Partial<DashboardDto> = {}): DashboardDto =>
    ({
      asOf: '2026-10-26T05:00:00.000Z',
      funding: {
        openProjects: 0,
        target: '0.00',
        raised: '0.00',
        percentFunded: '0.0',
        projects: [],
      },
      stages: {},
      active: {
        count: 1,
        projects: [
          {
            project: { id: 'p2', name: 'Maize in Bogura' },
            farmer: { id: 'f1', name: 'Hasina Uddin' },
            produceCode: 'MAIZE',
            districtCode: 'BOGURA',
            startedOn: '2026-05-01',
            plannedEndOn: '2026-09-30',
            overdue: true,
            raised: '50000.00',
            inputsCommitted: '10000.00',
            inputsSpent: '4000.00',
            lastFieldRecordAt: '2026-10-20T00:00:00Z',
            openClaims: 1,
            openListings: 2,
          },
        ],
      },
      queues: [],
      figures: {
        fundingRaised: '0.00',
        refunded: '0.00',
        salesIncome: '0.00',
        insuranceApproved: '0.00',
        inputsSpent: '0.00',
        payoutsPaid: '0.00',
        participants: {},
      },
      trends: {
        months: ['2026-10'],
        fundingRaised: ['0.00'],
        salesIncome: ['0.00'],
        payoutsPaid: ['0.00'],
        projectsStarted: [0],
        projectsFinished: [0],
      },
      figuresAsOf: '2026-10-26T05:00:00.000Z',
      ...over,
    }) as DashboardDto;

  it('lists active projects, refreshes on asking, and tries again after an error', async () => {
    await signedInAs('admin');
    let calls = 0;
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/dashboard'
        ? ++calls === 1
          ? { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } }
          : { body: { data: dashboard() } }
        : url.pathname === '/api/catalog'
          ? catalog
          : undefined,
    );
    await renderPage(<DashboardPage />, '/dashboard');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByText('Hasina Uddin', { exact: false }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() =>
      expect(
        sent.filter((s) => s.url.pathname === '/api/dashboard'),
      ).toHaveLength(3),
    );
  });
});
