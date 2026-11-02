// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDto } from '@/api/generated/projects';
import type {
  BatchDto,
  VoucherDetailDto,
  VoucherSaleDto,
} from '@/api/generated/vouchers';
import type { Role } from '@/app/navigation';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { BatchPage } from './batch-page';
import { BatchesList } from './batches-list';
import { ProjectVouchers } from './project-vouchers';
import { SalesList } from './sales-list';
import { VerifyBatchPage } from './verify-batch-page';
import { VoucherPage } from './voucher-page';
import { ProposeDialog } from './propose-dialog';
import { parseBatchSearch, parseSaleSearch } from './voucher-search';
import { VouchersList } from './vouchers-list';

beforeEach(() => {
  Object.assign(URL, {
    createObjectURL: () => 'blob:qr',
    revokeObjectURL: () => undefined,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.classList.remove('printing');
});

const input = {
  code: 'UREA',
  name: 'Urea',
  nameBn: 'ইউরিয়া',
  unit: 'kg',
  unitBn: 'কেজি',
};
const voucher = (over: Partial<VoucherDetailDto> = {}): VoucherDetailDto => ({
  id: 'v1',
  project: { id: 'p1', name: 'Maize in Bogura' },
  farmer: { id: 'f1', name: 'Rahim Uddin' },
  input,
  quantity: 100,
  unitPrice: '27.50',
  value: '2750.00',
  spentQuantity: 40,
  heldQuantity: 10,
  availableQuantity: 50,
  availableBalance: '1375.00',
  status: 'active',
  suppliers: [{ id: 'me', name: 'Krishi Store' }],
  proposedAt: '2026-10-01T00:00:00.000Z',
  lastActivityAt: '2026-10-10T00:00:00.000Z',
  inactivityLimitDays: null,
  inactiveSince: null,
  voidedAmount: null,
  sales: [],
  ...over,
});
const sale = (over: Partial<VoucherSaleDto> = {}): VoucherSaleDto => ({
  id: 7,
  voucherId: 'v1',
  supplier: { id: 's1', name: 'Krishi Store' },
  farmer: { id: 'f1', name: 'Rahim Uddin' },
  project: { id: 'p1', name: 'Maize in Bogura' },
  input,
  quantity: 10,
  amount: '275.00',
  status: 'pending',
  recordedAt: '2026-10-10T00:00:00.000Z',
  expiresAt: '2099-10-17T00:00:00.000Z',
  closedAt: null,
  batches: [
    { id: 'b1', lotNumber: 'KF-0412' },
    { id: 'b2', lotNumber: 'KF-0413' },
  ],
  ...over,
});
const batch = (over: Partial<BatchDto> = {}): BatchDto => ({
  id: 'b1',
  supplier: { id: 'me', name: 'Krishi Store' },
  input,
  lotNumber: 'KF-0412',
  quantity: 30,
  manufacturer: 'KAFCO',
  producedOn: '2026-09-01',
  expiresOn: '2099-09-01',
  notes: null,
  status: 'registered',
  registeredAt: '2026-09-02T00:00:00.000Z',
  verifyUrl: 'http://localhost:5173/verify/batch/b1',
  ...over,
});
const page = <T,>(data: T[], totalPages = 1) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages },
});
const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});
const catalog: Reply = {
  body: {
    data: {
      version: '1',
      units: [],
      inputTypes: [
        {
          code: 'UREA',
          name: 'Urea',
          nameBn: 'ইউরিয়া',
          active: true,
          sortOrder: 0,
          kind: 'fertilizer',
          unitCode: 'KG',
        },
      ],
      produceTypes: [],
      fieldRecordTypes: [],
      weatherEventTypes: [],
      districts: [],
    },
  },
};
const writes = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');

async function show(
  role: Role,
  ui: React.ReactNode,
  path: string,
  answer: (s: Sent) => Reply | undefined,
) {
  await signedInAs(role);
  const sent = fakeServer(answer);
  const view = await renderPage(ui, path);
  return { sent, ...view };
}

describe('the batch search', () => {
  it('keeps a search and a page, and drops the rest', () => {
    expect(parseBatchSearch({ q: ' kf ', page: '3', tab: 'x' })).toEqual({
      q: 'kf',
      page: 3,
    });
    expect(parseBatchSearch({ q: 7, page: '0' })).toEqual({});
    expect(parseSaleSearch({ q: ' 7 ', page: '2' })).toEqual({
      q: '7',
      page: 2,
    });
  });
});

describe('the batches list', () => {
  it('shows staff every supplier’s lots, searched and paged', async () => {
    const { router } = await show(
      'admin',
      <BatchesList search={{}} base="/vouchers/batches" />,
      '/vouchers/batches',
      () => ({
        body: page(
          [
            batch(),
            batch({
              id: 'b2',
              lotNumber: 'OLD-1',
              manufacturer: null,
              expiresOn: '2000-01-01',
              status: 'submitted',
            }),
          ],
          2,
        ),
      }),
    );
    expect(
      (await screen.findByRole('link', { name: 'Lot KF-0412' })).getAttribute(
        'href',
      ),
    ).toBe('/vouchers/batches/b1');
    expect(screen.getAllByText('Krishi Store').length).toBe(2);
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText('Sending to Ledger')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Register Batch/ })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox'), 'kafco');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'kafco' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('says when there are none, or none match, and tries again', async () => {
    await show(
      'supplier',
      <BatchesList search={{}} base="/batches" />,
      '/batches',
      () => ({ body: page([]) }),
    );
    expect(
      await screen.findByText(
        'Register a batch to print QR labels for its bags.',
      ),
    ).toBeTruthy();
    cleanup();
    let calls = 0;
    await show(
      'admin',
      <BatchesList search={{ q: 'zz' }} base="/vouchers/batches" />,
      '/vouchers/batches',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByText('No Batch Matches Your Search'),
    ).toBeTruthy();
  });

  it('lets a supplier register a lot, checking its dates and size', async () => {
    let refuse = true;
    const { sent, router } = await show(
      'supplier',
      <BatchesList search={{}} base="/batches" />,
      '/batches',
      (s) => {
        if (s.method === 'POST')
          return refuse
            ? failure(409, 'LOT_ALREADY_REGISTERED')
            : { status: 201, body: { data: batch({ id: 'b9' }) } };
        if (s.url.pathname === '/api/catalog') return catalog;
        return { body: page([batch()]) };
      },
    );
    expect(
      (await screen.findByRole('link', { name: 'Lot KF-0412' })).getAttribute(
        'href',
      ),
    ).toBe('/batches/b1');
    await userEvent.click(
      screen.getByRole('button', { name: /Register Batch/ }),
    );
    const dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Register Batch' });
    await userEvent.click(save);
    expect(within(dialog).getByText('Choose an input.')).toBeTruthy();
    expect(
      within(dialog).getByText('Enter the lot number printed on the goods.'),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        'Enter the production date; it cannot be in the future.',
      ),
    ).toBeTruthy();

    await userEvent.type(within(dialog).getByLabelText('Input'), 'ure');
    await userEvent.click(await screen.findByRole('option', { name: 'Urea' }));
    await userEvent.type(within(dialog).getByLabelText('Lot Number'), ' KF-9 ');
    await userEvent.type(within(dialog).getByLabelText('Batch Size'), '0');
    await userEvent.type(
      within(dialog).getByLabelText('Production Date'),
      '2026-09-01',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Expiry Date'),
      '2026-08-01',
    );
    await userEvent.click(save);
    expect(
      within(dialog).getByText(
        'The expiry date cannot be before the production date.',
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('Enter a whole number of at least 1.'),
    ).toBeTruthy();

    await userEvent.clear(within(dialog).getByLabelText('Batch Size'));
    await userEvent.type(within(dialog).getByLabelText('Batch Size'), '৫০০');
    await userEvent.clear(within(dialog).getByLabelText('Expiry Date'));
    await userEvent.type(
      within(dialog).getByLabelText('Expiry Date'),
      '2027-09-01',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Manufacturer'),
      ' KAFCO ',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Notes'),
      ' 50 kg bags ',
    );
    await userEvent.click(save);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(save);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/batches/b9'),
    );
    expect(writes(sent).at(-1)!.body).toEqual({
      inputTypeCode: 'UREA',
      lotNumber: 'KF-9',
      producedOn: '2026-09-01',
      quantity: 500,
      manufacturer: 'KAFCO',
      expiresOn: '2027-09-01',
      notes: '50 kg bags',
    });
  });

  it('registers only what is required, and closes on Cancel or Escape', async () => {
    const { sent, router } = await show(
      'supplier',
      <BatchesList search={{}} base="/vouchers/batches" />,
      '/vouchers/batches',
      (s) =>
        s.method === 'POST'
          ? { status: 201, body: { data: batch({ id: 'b9' }) } }
          : s.url.pathname === '/api/catalog'
            ? catalog
            : { body: page([]) },
    );
    const register = await screen.findByRole('button', {
      name: /Register Batch/,
    });
    await userEvent.click(register);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(register);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(register);
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Input'), 'ure');
    await userEvent.click(await screen.findByRole('option', { name: 'Urea' }));
    await userEvent.type(within(dialog).getByLabelText('Lot Number'), 'KF-10');
    await userEvent.type(
      within(dialog).getByLabelText('Production Date'),
      '2026-09-01',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Register Batch' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent)[0]!.body).toEqual({
      inputTypeCode: 'UREA',
      lotNumber: 'KF-10',
      producedOn: '2026-09-01',
    });
    // Registered from the staff list: it stays on the list.
    expect(router.state.location.pathname).toBe('/vouchers/batches');
  });
});

describe('the sales list', () => {
  it('moves between statuses, searches and pages', async () => {
    const { router, sent } = await show(
      'accounts',
      <SalesList search={{}} />,
      '/vouchers/sales',
      () => ({ body: page([sale()], 2) }),
    );
    expect(await screen.findByText(/Sale #7/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'KF-0413' })).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /Open Voucher · Maize in Bogura/ })
        .getAttribute('href'),
    ).toBe('/vouchers/v1');
    // Accounts neither confirm nor cancel.
    expect(screen.queryByRole('button', { name: /Sale/ })).toBeNull();
    expect(sent[0]!.url.searchParams.get('status')).toBe('pending');
    await userEvent.click(screen.getByRole('tab', { name: 'Confirmed' }));
    expect(router.state.location.search).toEqual({ tab: 'confirmed' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({ tab: 'all' });
    await userEvent.click(
      screen.getByRole('tab', { name: 'Awaiting Confirmation' }),
    );
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'rahim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'rahim' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('shows all sales on the All tab, and says when none match', async () => {
    const { sent } = await show(
      'supplier',
      <SalesList search={{ tab: 'all', q: 'x' }} />,
      '/vouchers/sales',
      () => ({ body: page([]) }),
    );
    expect(await screen.findByText('No Sale Matches Your Search')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('status')).toBeNull();
    cleanup();
    let calls = 0;
    await show(
      'field_officer',
      <SalesList search={{}} />,
      '/vouchers/sales',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No Sales Here')).toBeTruthy();
  });

  it('lets the supplier cancel a pending sale, keeping the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await show(
      'supplier',
      <SalesList search={{}} />,
      '/vouchers/sales',
      (s) =>
        s.method === 'POST'
          ? refuse
            ? failure(409, 'SALE_NOT_PENDING')
            : { body: { data: sale({ status: 'cancelled' }) } }
          : { body: page([sale()]) },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel Sale' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('The 10 kg goes back to the voucher.'),
    ).toBeTruthy();
    const go = within(dialog).getByRole('button', { name: 'Cancel Sale' });
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.url.pathname).toBe(
      '/api/voucher-sales/7/cancel',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Sale' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('a project’s vouchers', () => {
  const card = (
    role: Role,
    over: Partial<ProjectDto> = {},
    vouchers = [voucher()],
  ) =>
    show(
      role,
      <ProjectVouchers
        project={project({
          id: 'p1',
          stage: 'active',
          chainState: 'confirmed',
          ...over,
        })}
      />,
      '/projects/p1',
      (s) => {
        if (s.url.pathname === '/api/projects/p1/voucher-summary')
          return {
            body: {
              data: {
                fundingTarget: '200000.00',
                committed: '2750.00',
                room: '197250.00',
                spent: '1100.00',
                pendingSales: '275.00',
              },
            },
          };
        if (s.url.pathname === '/api/vouchers') return { body: page(vouchers) };
        if (s.url.pathname === '/api/catalog') return catalog;
        return undefined;
      },
    );

  it('shows staff what they commit and spend, each voucher, and proposing', async () => {
    await card('operations');
    expect(await screen.findByText('৳ 197,250')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Urea · 100 kg/ }).getAttribute('href'),
    ).toBe('/vouchers/v1');
    await userEvent.click(
      screen.getByRole('button', { name: /Propose Voucher/ }),
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says when there are none, and offers no proposing past the field', async () => {
    await card('auditor', { stage: 'ready_for_sale' }, []);
    expect(await screen.findByText('No Vouchers Yet')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Propose Voucher/ }),
    ).toBeNull();
  });

  it('shows nothing to others, before the ledger or before funding', async () => {
    for (const [role, over] of [
      ['investor', {}],
      ['admin', { chainState: 'local' }],
      ['admin', { stage: 'open_for_funding' }],
    ] as const) {
      const { sent } = await card(role, over);
      await new Promise((r) => setTimeout(r, 50));
      expect(sent).toEqual([]);
      cleanup();
    }
  });
});

describe('a voucher', () => {
  const at = (
    role: Role,
    v: VoucherDetailDto | (() => Reply),
    write: (s: Sent) => Reply = () => ({ body: { data: voucher() } }),
  ) =>
    show(role, <VoucherPage id="v1" />, '/vouchers/v1', (s) => {
      if (s.method !== 'GET') return write(s);
      if (s.url.pathname === '/api/vouchers/v1')
        return typeof v === 'function' ? v() : { body: { data: v } };
      if (s.url.pathname === '/api/vouchers/v1/qr.svg')
        return { body: '<svg/>' };
      if (s.url.pathname === '/api/batches') return { body: page([batch()]) };
      return undefined;
    });

  it('is rejected by Accounts, keeping the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await at(
      'accounts',
      voucher({ status: 'proposed' }),
      () =>
        refuse
          ? failure(409, 'VOUCHER_NOT_PROPOSED')
          : { body: { data: voucher({ status: 'rejected' }) } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reject' }),
    );
    const dialog = screen.getByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Reject' });
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.url.pathname).toBe('/api/vouchers/v1/reject');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('is cancelled by an admin', async () => {
    const { sent } = await at('admin', voucher());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel Voucher' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel Voucher',
      }),
    );
    await waitFor(() =>
      expect(writes(sent).at(-1)?.url.pathname).toBe('/api/vouchers/v1/cancel'),
    );
  });

  it('is discarded by who proposed it while it never reached the ledger', async () => {
    const { sent, router } = await at(
      'operations',
      voucher({ status: 'submitted' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Discard/ }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Discard/,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/vouchers'),
    );
    expect(writes(sent)[0]!.method).toBe('DELETE');
  });

  it('prints its QR for the farmer', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    await at('field_officer', voucher());
    const button = await screen.findByRole('button', { name: /Print QR/ });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await userEvent.click(button);
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() =>
      expect(document.querySelector('.print-sheet')).toBeNull(),
    );
  });

  it('keeps a sale with the reason when the ledger refuses it, and lets a lot be unticked', async () => {
    let refuse = true;
    const { sent } = await at('supplier', voucher(), () =>
      refuse
        ? failure(409, 'VOUCHER_BALANCE_LOW')
        : { status: 201, body: { data: sale() } },
    );
    await userEvent.type(await screen.findByLabelText('Quantity (kg)'), '5');
    const lot = await screen.findByRole('checkbox', { name: /Lot KF-0412/ });
    await userEvent.click(lot);
    await userEvent.click(lot);
    const record = screen
      .getAllByRole('button', { name: 'Record Sale' })
      .at(-1)!;
    await userEvent.click(record);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(record);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Quantity (kg)') as HTMLInputElement).value,
      ).toBe(''),
    );
    expect(writes(sent).at(-1)!.body).toEqual({ quantity: 5 });
  });

  it('lets the super admin set, refuse and remove an inactivity limit', async () => {
    let refuse = true;
    const { sent } = await at(
      'super_admin',
      voucher({ inactivityLimitDays: 30 }),
      () =>
        refuse
          ? failure(503, 'LEDGER_UNAVAILABLE')
          : { body: { data: voucher() } },
    );
    const days = await screen.findByLabelText('Days');
    expect((days as HTMLInputElement).value).toBe('30');
    await userEvent.clear(days);
    await userEvent.type(days, '0');
    const save = screen.getByRole('button', { name: 'Save Limit' });
    await userEvent.click(save);
    expect(screen.getByText(/Enter a whole number/)).toBeTruthy();
    await userEvent.clear(days);
    await userEvent.type(days, '৪৫');
    await userEvent.click(save);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(save);
    await waitFor(() =>
      expect(writes(sent).at(-1)!.body).toEqual({ days: 45 }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Limit' }));
    await waitFor(() =>
      expect(writes(sent).at(-1)!.body).toEqual({ days: null }),
    );
    expect((screen.getByLabelText('Days') as HTMLInputElement).value).toBe('');
    // Saved empty: no limit.
    await userEvent.click(save);
    await waitFor(() => expect(writes(sent)).toHaveLength(4));
    expect(writes(sent).at(-1)!.body).toEqual({ days: null });
  });

  it('tells staff the limit, not the farmer', async () => {
    await at('accounts', voucher({ inactivityLimitDays: 30 }));
    expect(
      await screen.findByText('Flagged as inactive after 30 days without use.'),
    ).toBeTruthy();
    cleanup();
    await at('farmer', voucher({ inactivityLimitDays: 30 }));
    await screen.findAllByText(/Urea/);
    expect(screen.queryByText(/Flagged as inactive/)).toBeNull();
  });

  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await at('accounts', () =>
      ++calls > 1 ? { body: { data: voucher() } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect((await screen.findAllByText(/Urea/)).length).toBeGreaterThan(0);
  });
});

describe('the vouchers list, further', () => {
  it('moves between tabs and pages, and proposes from the list', async () => {
    const { router, sent } = await show(
      'operations',
      <VouchersList search={{}} />,
      '/vouchers',
      (s) =>
        s.url.pathname === '/api/vouchers'
          ? { body: page([voucher()], 2) }
          : s.url.pathname === '/api/projects'
            ? { body: page([project({ id: 'p1', stage: 'active' })]) }
            : s.url.pathname === '/api/catalog'
              ? catalog
              : undefined,
    );
    await screen.findByText('Rahim Uddin');
    await userEvent.click(screen.getByRole('tab', { name: 'Inactive' }));
    expect(router.state.location.search).toEqual({ tab: 'inactive' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });

    await userEvent.click(
      screen.getByRole('button', { name: /Propose Voucher/ }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByLabelText('Project', { selector: 'input' }),
    );
    expect((await screen.findAllByRole('option')).length).toBeGreaterThan(0);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    void sent;
  });

  it('asks for inactive vouchers, and tries again after an error', async () => {
    let calls = 0;
    const { sent } = await show(
      'admin',
      <VouchersList search={{ tab: 'inactive' }} />,
      '/vouchers',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No Vouchers Yet')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('inactive')).toBe('true');
  });
});

describe('a batch', () => {
  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await show(
      'supplier',
      <BatchPage id="b1" base="/batches" />,
      '/batches/b1',
      (s) =>
        s.url.pathname === '/api/batches/b1'
          ? ++calls > 1
            ? { body: { data: batch() } }
            : failure(500, 'X')
          : undefined,
    );
    expect(
      (await screen.findByRole('link', { name: /Batches/ })).getAttribute(
        'href',
      ),
    ).toBe('/batches');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect((await screen.findAllByText(/KAFCO/)).length).toBeGreaterThan(0);
  });

  it('asks how many labels, within what fits', async () => {
    await show(
      'supplier',
      <BatchPage id="b1" base="/batches" />,
      '/batches/b1',
      (s) =>
        s.url.pathname === '/api/batches/b1'
          ? { body: { data: batch({ quantity: null }) } }
          : s.url.pathname === '/api/verify/batches/b1/qr.svg'
            ? { body: '<svg/>' }
            : undefined,
    );
    const open = await screen.findByRole('button', { name: 'Print Labels' });
    await waitFor(() => expect(open.hasAttribute('disabled')).toBe(false));
    await userEvent.click(open);
    const dialog = screen.getByRole('dialog');
    const count = within(dialog).getByLabelText('Number of Labels');
    // No batch size: one sheet to start with.
    expect((count as HTMLInputElement).value).toBe('21');
    await userEvent.clear(count);
    await userEvent.type(count, '0');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Print' }),
    );
    expect(
      within(dialog).getByText(/Enter a whole number from 1 to/),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(open);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('checking a lot', () => {
  it('says why it cannot check, and tries again', async () => {
    let calls = 0;
    await show('farmer', <VerifyBatchPage id="b1" />, '/verify/batch/b1', () =>
      ++calls > 1
        ? { body: { data: { genuine: false, expired: false } } }
        : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Not Verified')).toBeTruthy();
  });
});

describe('proposing, further', () => {
  it('keeps the proposal with the reason when refused, and lets a supplier be unticked', async () => {
    const { sent } = await show(
      'operations',
      <ProposeDialog projectId="p1" onClose={() => undefined} />,
      '/projects/p1',
      (s) => {
        if (s.method === 'POST') return failure(409, 'VOUCHER_EXCEEDS_ROOM');
        if (s.url.pathname === '/api/catalog') return catalog;
        if (s.url.pathname === '/api/projects/p1/voucher-summary')
          return {
            body: {
              data: {
                fundingTarget: '200000.00',
                committed: '0.00',
                room: '1000.00',
                spent: '0.00',
                pendingSales: '0.00',
              },
            },
          };
        if (s.url.pathname === '/api/voucher-suppliers')
          return {
            body: page([
              { id: 's1', name: 'Krishi Store' },
              { id: 's2', name: 'Sabuj Seeds' },
            ]),
          };
        return undefined;
      },
    );
    await userEvent.type(await screen.findByLabelText('Input'), 'Ure');
    await userEvent.click(await screen.findByRole('option', { name: 'Urea' }));
    await userEvent.type(screen.getByLabelText(/^Quantity/), '100');
    await userEvent.type(screen.getByLabelText('Unit Price (৳)'), '27.5');
    const first = await screen.findByRole('checkbox', { name: 'Krishi Store' });
    await userEvent.click(first);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Sabuj Seeds' }),
    );
    await userEvent.click(first);
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit Proposal' }),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(writes(sent)[0]!.body).toMatchObject({ supplierIds: ['s2'] });
  });
});
