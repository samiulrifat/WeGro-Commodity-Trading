// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BatchDto,
  VoucherDetailDto,
  VoucherSaleDto,
} from '@/api/generated/vouchers';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { BatchPage } from './batch-page';
import { labelPages, PER_SHEET } from './labels';
import { ProposeDialog } from './propose-dialog';
import { VerifyBatchPage } from './verify-batch-page';
import { VoucherPage } from './voucher-page';
import {
  isExpired,
  parseSaleSearch,
  parseVoucherSearch,
  usedShare,
  voucherValue,
} from './voucher-search';
import { VouchersList } from './vouchers-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.classList.remove('printing');
});

const input = { code: 'UREA', name: 'Urea', nameBn: 'ইউরিয়া', unit: 'kg' };

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
  batches: [{ id: 'b1', lotNumber: 'KF-0412' }],
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

describe('voucher helpers', () => {
  it('values a voucher exactly, in poisha', () => {
    expect(voucherValue(3, '0.10')).toBe('0.30');
    expect(voucherValue(100, '27.50')).toBe('2750.00');
    expect(voucherValue(1_000_000, '99999.99')).toBe('99999990000.00');
  });

  it('lays labels out 21 to a sheet, the rest on the last', () => {
    expect(PER_SHEET).toBe(21);
    expect(labelPages(21)).toEqual([21]);
    expect(labelPages(30)).toEqual([21, 9]);
    expect(labelPages(0)).toEqual([]);
  });

  it('keeps only what the lists understand from the address', () => {
    expect(
      parseVoucherSearch({ tab: 'inactive', q: ' 0171 ', page: '2' }),
    ).toEqual({
      tab: 'inactive',
      q: '0171',
      page: 2,
    });
    expect(parseVoucherSearch({ tab: 'all' })).toEqual({});
    expect(parseSaleSearch({ tab: 'pending' })).toEqual({});
    expect(parseSaleSearch({ tab: 'confirmed' })).toEqual({ tab: 'confirmed' });
  });

  it('measures use and expiry', () => {
    expect(usedShare(voucher())).toBe(40);
    expect(isExpired({ expiresOn: '2000-01-01' })).toBe(true);
    expect(isExpired({ expiresOn: null })).toBe(false);
  });
});

describe('voucher list', () => {
  it('searches by the words typed', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/vouchers'
        ? {
            body: {
              data: [voucher()],
              meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
            },
          }
        : undefined,
    );
    const { router } = await renderPage(
      <VouchersList search={{}} />,
      '/vouchers',
    );
    expect(await screen.findByText('Urea')).toBeTruthy();
    expect(screen.getByText('40 of 100 kg used')).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox'), 'Rahim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ q: 'Rahim' }),
    );
    expect(sent[0]!.url.searchParams.get('limit')).toBe('12');
  });
});

describe('proposing', () => {
  it('sends the input, whole units, the exact price and the chosen suppliers', async () => {
    await signedInAs('operations');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/catalog') {
        return {
          body: {
            data: {
              version: '1',
              units: [
                {
                  code: 'KG',
                  name: 'Kilogram',
                  nameBn: 'কেজি',
                  active: true,
                  sortOrder: 0,
                  kind: 'mass',
                  symbol: 'kg',
                },
              ],
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
      }
      if (url.pathname === '/api/projects/p1/voucher-summary') {
        return {
          body: {
            data: {
              fundingTarget: '200000.00',
              committed: '0.00',
              room: '200000.00',
              spent: '0.00',
              pendingSales: '0.00',
            },
          },
        };
      }
      if (url.pathname === '/api/voucher-suppliers') {
        return {
          body: {
            data: [{ id: 's1', name: 'Krishi Store' }],
            meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
          },
        };
      }
      if (method === 'POST' && url.pathname === '/api/projects/p1/vouchers') {
        return { status: 201, body: { data: voucher({ status: 'proposed' }) } };
      }
      return undefined;
    });
    await renderPage(
      <ProposeDialog projectId="p1" onClose={() => undefined} />,
      '/projects/p1',
    );
    expect(
      await screen.findByText(
        /200,000 of this project’s funding is still free/,
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit Proposal' }),
    );
    expect(screen.getByText('Choose at least one supplier.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Input'), 'Ure');
    await userEvent.click(await screen.findByRole('option', { name: 'Urea' }));
    await userEvent.type(screen.getByLabelText('Quantity (kg)'), '100');
    await userEvent.type(screen.getByLabelText('Unit Price (৳)'), '27.5');
    expect(screen.getByText('৳ 2,750')).toBeTruthy();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Krishi Store' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit Proposal' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({
        inputTypeCode: 'UREA',
        quantity: 100,
        unitPrice: '27.5',
        supplierIds: ['s1'],
      }),
    );
  });
});

describe('who proposes', () => {
  it('shows Propose Voucher to Operations, admins and the super admin, not Accounts', async () => {
    const page = {
      data: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
    };
    for (const [role, shown] of [
      ['operations', true],
      ['admin', true],
      ['super_admin', true],
      ['accounts', false],
    ] as const) {
      await signedInAs(role);
      fakeServer(({ url }) =>
        url.pathname === '/api/vouchers' ? { body: page } : undefined,
      );
      await renderPage(<VouchersList search={{}} />, '/vouchers');
      await screen.findByText('No Vouchers Yet');
      expect(!!screen.queryByRole('button', { name: 'Propose Voucher' })).toBe(
        shown,
      );
      cleanup();
    }
  });
});

describe('voucher page', () => {
  it('lets Accounts approve a proposed voucher', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/vouchers/v1')
        return { body: { data: voucher({ status: 'proposed' }) } };
      if (method === 'POST' && url.pathname === '/api/vouchers/v1/approve') {
        return { body: { data: voucher() } };
      }
      return undefined;
    });
    await renderPage(<VoucherPage id="v1" />, '/vouchers/v1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Approve' }),
    );
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.method === 'POST' &&
            s.url.pathname === '/api/vouchers/v1/approve',
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole('button', { name: 'Cancel Voucher' })).toBeNull();
  });

  it('lets a named supplier record a sale from their batches', async () => {
    await signedInAs('supplier');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/vouchers/v1')
        return { body: { data: voucher() } };
      if (url.pathname === '/api/batches') {
        return {
          body: {
            data: [batch()],
            meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
          },
        };
      }
      if (method === 'POST' && url.pathname === '/api/vouchers/v1/sales') {
        return { status: 201, body: { data: sale() } };
      }
      return undefined;
    });
    await renderPage(<VoucherPage id="v1" />, '/vouchers/v1');
    const quantity = await screen.findByLabelText('Quantity (kg)');
    await userEvent.type(quantity, '60');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Record Sale' }).at(-1)!,
    );
    expect(
      await screen.findByText('Enter a whole number from 1 to 50.'),
    ).toBeTruthy();
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '১০');
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Lot KF-0412/ }),
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Record Sale' }).at(-1)!,
    );
    await waitFor(() => {
      const post = sent.find((s) => s.method === 'POST');
      expect(post?.body).toEqual({ quantity: 10, batchIds: ['b1'] });
    });
    expect(
      sent
        .find((s) => s.url.pathname === '/api/batches')
        ?.url.searchParams.get('inputTypeCode'),
    ).toBe('UREA');
  });

  it('lets the field officer confirm a pending sale', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/vouchers/v1')
        return { body: { data: voucher({ sales: [sale()] }) } };
      if (
        method === 'POST' &&
        url.pathname === '/api/voucher-sales/7/confirm'
      ) {
        return { body: { data: sale({ status: 'confirmed' }) } };
      }
      return undefined;
    });
    await renderPage(<VoucherPage id="v1" />, '/vouchers/v1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm Sale' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Rahim Uddin has received 10 kg/),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm Sale' }),
    );
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.method === 'POST' &&
            s.url.pathname === '/api/voucher-sales/7/confirm',
        ),
      ).toBe(true),
    );
  });
});

describe('batches', () => {
  it('prints the labels chosen, 21 to a sheet', async () => {
    await signedInAs('supplier');
    Object.assign(URL, {
      createObjectURL: () => 'blob:qr',
      revokeObjectURL: () => undefined,
    });
    const print = vi.fn();
    vi.stubGlobal('print', print);
    fakeServer(({ url }) => {
      if (url.pathname === '/api/batches/b1')
        return { body: { data: batch() } };
      if (url.pathname === '/api/verify/batches/b1/qr.svg')
        return { body: '<svg/>' };
      return undefined;
    });
    await renderPage(<BatchPage id="b1" base="/batches" />, '/batches/b1');
    const open = await screen.findByRole('button', { name: 'Print Labels' });
    await waitFor(() =>
      expect((open as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.click(open);
    const dialog = await screen.findByRole('dialog');
    expect(
      (within(dialog).getByLabelText('Number of Labels') as HTMLInputElement)
        .value,
    ).toBe('30');
    expect(within(dialog).getByText('2 sheets')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Print' }),
    );
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    const pages = document.querySelectorAll('.print-sheet .label-page');
    expect([...pages].map((p) => p.children.length)).toEqual([21, 9]);
    expect(document.body.classList.contains('printing')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() =>
      expect(document.querySelector('.print-sheet')).toBeNull(),
    );
    expect(document.body.classList.contains('printing')).toBe(false);
  });

  it('tells anyone, without signing in, whether a lot is genuine', async () => {
    await signedInAs('farmer');
    fakeServer(({ url }) =>
      url.pathname === '/api/verify/batches/b1'
        ? {
            body: {
              data: {
                genuine: true,
                product: input,
                lotNumber: 'KF-0412',
                manufacturer: 'KAFCO',
                producedOn: '2026-09-01',
                expiresOn: '2026-10-01',
                expired: true,
                supplierName: 'Krishi Store',
                registeredAt: '2026-09-02T00:00:00.000Z',
              },
            },
          }
        : url.pathname === '/api/verify/batches/nope'
          ? { body: { data: { genuine: false, expired: false } } }
          : undefined,
    );
    await renderPage(<VerifyBatchPage id="b1" />, '/verify/batch/b1');
    expect(await screen.findByText('Genuine, but Expired')).toBeTruthy();
    expect(screen.getByText('KAFCO')).toBeTruthy();
    cleanup();
    await renderPage(<VerifyBatchPage id="nope" />, '/verify/batch/nope');
    expect(await screen.findByText('Not Verified')).toBeTruthy();
  });
});
