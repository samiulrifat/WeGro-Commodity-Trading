// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptDetailDto, SiteDto } from '@/api/generated/warehouse';
import { todayBd } from '@/lib/format';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import {
  dayAfter,
  daysLeft,
  expiringSoon,
  moisture,
  parseReceiptSearch,
  receiptNumber,
  wholeNumber,
} from './receipt-utils';
import { ReceiptPage } from './receipt-page';
import { ReceiptsList } from './receipts-list';
import { SitesPage } from './sites-page';
import { VerifyReceiptPage } from './verify-receipt-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.classList.remove('printing');
});

const ID = `0x3f9a2c1b${'0'.repeat(56)}`;
const SITE = '11111111-1111-4111-8111-111111111111';
const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages: 1 },
});

const site = (over: Partial<SiteDto> = {}): SiteDto => ({
  id: SITE,
  name: 'Bogura Central',
  districtCode: 'BOGURA',
  districtName: 'Bogura',
  address: 'Shibganj road, Bogura Sadar',
  storageType: 'warehouse',
  capacityKg: 500000,
  status: 'registered',
  closed: false,
  closedAt: null,
  operators: [{ id: 'me', name: 'Anwar Bepari' }],
  ...over,
});

const receipt = (over: Partial<ReceiptDetailDto> = {}): ReceiptDetailDto => ({
  id: ID,
  project: { id: 'p1', name: 'Potato in Rangpur #7' },
  site: { id: SITE, name: 'Bogura Central' },
  owner: { kind: 'farmer', id: 'f1', name: 'Karim Islam' },
  produce: {
    code: 'POTATO',
    name: 'Potato',
    nameBn: 'আলু',
    unit: 'kg',
    unitBn: 'কেজি',
  },
  quantity: 2000,
  originalQuantity: 2000,
  status: 'issued',
  pendingHandover: false,
  parentId: null,
  intake: {
    bagCount: 40,
    moisturePercent: '13.5',
    storageBay: 'Bay C-4',
    intakeDate: '2026-10-01',
    notes: null,
  },
  expiresOn: dayAfter(120),
  expired: false,
  issuedAt: '2026-10-01T05:00:00.000Z',
  collectedAt: null,
  detailsHash: '0x1',
  verifyUrl: `http://localhost:5173/verify/receipt/${ID}`,
  rechecks: [],
  children: [],
  ...over,
});

describe('receipt helpers', () => {
  it('prints a short number and finds what is due a re-check', () => {
    expect(receiptNumber(ID)).toBe('WR-3F9A2C1B');
    expect(dayAfter(14, '2026-12-25')).toBe('2027-01-08');
    expect(daysLeft('2026-11-05', '2026-10-22')).toBe(14);
    const today = '2026-10-22';
    expect(
      expiringSoon(
        { status: 'issued', expiresOn: '2026-11-05', expired: false },
        today,
      ),
    ).toBe(true);
    expect(
      expiringSoon(
        { status: 'issued', expiresOn: '2026-11-06', expired: false },
        today,
      ),
    ).toBe(false);
    expect(
      expiringSoon(
        { status: 'collected', expiresOn: '2026-10-25', expired: false },
        today,
      ),
    ).toBe(false);
  });

  it('reads numbers as typed, in either script', () => {
    expect(wholeNumber('২,০০০')).toBe(2000);
    expect(wholeNumber('')).toBeNull();
    expect(wholeNumber('12.5')).toBeNaN();
    expect(moisture('১৩.৫')).toBe('13.5');
    expect(moisture('')).toBeNull();
    expect(moisture('13.55')).toBeUndefined();
    expect(moisture('101')).toBeUndefined();
    expect(
      parseReceiptSearch({ tab: 'expiring', page: '2', q: ' WR-3F9A ' }),
    ).toEqual({ tab: 'expiring', page: 2, q: 'WR-3F9A' });
    expect(parseReceiptSearch({ tab: 'all' })).toEqual({});
  });
});

describe('receipt list', () => {
  it('asks for receipts due within two weeks on Expiring Soon', async () => {
    await signedInAs('warehouse');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/warehouse-receipts'
        ? { body: page([receipt()]) }
        : undefined,
    );
    await renderPage(
      <ReceiptsList search={{ tab: 'expiring' }} />,
      '/warehouse',
    );
    expect(await screen.findByText(/Potato · 2,000 kg/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Issue Receipt/ })).toBeTruthy();
    const params = sent.find(
      (s) => s.url.pathname === '/api/warehouse-receipts',
    )!.url.searchParams;
    expect(params.get('expiresBy')).toBe(dayAfter(14, todayBd()));
    expect(params.get('status')).toBeNull();
  });
});

describe('receipt page', () => {
  it('lets an operator of the issuing site re-check and extend it', async () => {
    await signedInAs('warehouse');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/warehouse-receipts/${ID}`)
        return { body: { data: receipt() } };
      if (url.pathname === '/api/warehouse-sites')
        return { body: { data: [site()] } };
      if (
        method === 'POST' &&
        url.pathname === `/api/warehouse-receipts/${ID}/extend`
      )
        return { body: { data: receipt() } };
      return undefined;
    });
    await renderPage(<ReceiptPage id={ID} />, `/warehouse/receipts/${ID}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Re-Check and Extend' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Moisture (%)'), '১২.৮');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save Re-Check' }),
    );
    await waitFor(() => {
      const post = sent.find((s) => s.method === 'POST');
      expect(post?.body).toMatchObject({
        checkedOn: todayBd(),
        moisturePercent: '12.8',
        bagCount: 40,
        storageBay: 'Bay C-4',
      });
    });
    expect(screen.getByRole('button', { name: 'Mark Collected' })).toBeTruthy();
  });

  it('shows an operator of another site no moves', async () => {
    await signedInAs('warehouse');
    fakeServer(({ url }) => {
      if (url.pathname === `/api/warehouse-receipts/${ID}`)
        return { body: { data: receipt() } };
      if (url.pathname === '/api/warehouse-sites')
        return {
          body: {
            data: [site({ id: '22222222-2222-4222-8222-222222222222' })],
          },
        };
      return undefined;
    });
    await renderPage(<ReceiptPage id={ID} />, `/warehouse/receipts/${ID}`);
    await screen.findByText('Receipt Details');
    expect(
      screen.queryByRole('button', { name: 'Re-Check and Extend' }),
    ).toBeNull();
  });

  it('lets the farmer’s officer offer it to WeGro, and an admin accept', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/warehouse-receipts/${ID}`)
        return { body: { data: receipt() } };
      if (method === 'POST')
        return { body: { data: receipt({ status: 'pending_handover' }) } };
      return undefined;
    });
    await renderPage(<ReceiptPage id={ID} />, `/warehouse/receipts/${ID}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Offer to WeGro' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Offer to WeGro',
      }),
    );
    await waitFor(() =>
      expect(
        sent.some(
          (s) => s.url.pathname === `/api/warehouse-receipts/${ID}/handover`,
        ),
      ).toBe(true),
    );
    cleanup();

    await signedInAs('admin');
    const admin = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/warehouse-receipts/${ID}`)
        return {
          body: {
            data: receipt({
              status: 'pending_handover',
              pendingHandover: true,
            }),
          },
        };
      if (method === 'POST')
        return {
          body: { data: receipt({ owner: { kind: 'wegro', name: 'WeGro' } }) },
        };
      return undefined;
    });
    await renderPage(<ReceiptPage id={ID} />, `/warehouse/receipts/${ID}`);
    expect(
      await screen.findByRole('button', { name: 'Decline Handover' }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Accept Handover' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Accept Handover',
      }),
    );
    await waitFor(() =>
      expect(
        admin.some(
          (s) =>
            s.url.pathname === `/api/warehouse-receipts/${ID}/handover/accept`,
        ),
      ).toBe(true),
    );
  });

  it('prints an A4 receipt with its number and QR', async () => {
    await signedInAs('farmer');
    Object.assign(URL, {
      createObjectURL: () => 'blob:qr',
      revokeObjectURL: () => undefined,
    });
    const print = vi.fn();
    vi.stubGlobal('print', print);
    fakeServer(({ url }) => {
      if (url.pathname === `/api/warehouse-receipts/${ID}`)
        return { body: { data: receipt() } };
      if (url.pathname === `/api/verify/receipts/${ID}/qr.svg`)
        return { body: '<svg/>' };
      return undefined;
    });
    await renderPage(<ReceiptPage id={ID} />, `/warehouse/receipts/${ID}`);
    const button = await screen.findByRole('button', { name: /Print Receipt/ });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.click(button);
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    const sheet = document.querySelector('.print-sheet.receipt-sheet')!;
    expect(sheet.textContent).toContain('WR-3F9A2C1B');
    expect(sheet.textContent).toContain('Karim Islam');
    expect(sheet.textContent).toContain('2,000 kg');
    expect(sheet.querySelector('img[src="blob:qr"]')).toBeTruthy();
    act(() => void window.dispatchEvent(new Event('afterprint')));
    await waitFor(() =>
      expect(document.querySelector('.print-sheet')).toBeNull(),
    );
  });
});

describe('sites', () => {
  it('lets an admin change only what changed, close a site and add an operator', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/warehouse-sites')
        return { body: { data: [site({ operators: [] })] } };
      if (url.pathname === '/api/catalog') {
        return {
          body: {
            data: {
              version: '1',
              units: [],
              produceTypes: [],
              inputTypes: [],
              fieldRecordTypes: [],
              weatherEventTypes: [],
              districts: [
                { code: 'BOGURA', name: 'Bogura', division: 'Rajshahi' },
              ],
            },
          },
        };
      }
      if (url.pathname === '/api/participants') {
        return {
          body: page([
            {
              id: 'op2',
              fullName: 'Rahima Khatun',
              role: 'warehouse',
              status: 'verified',
            },
          ]),
        };
      }
      if (method !== 'GET') return { body: { data: site() } };
      return undefined;
    });
    await renderPage(<SitesPage search={{}} />, '/warehouse/sites');
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit Site/ }),
    );
    let dialog = screen.getByRole('dialog');
    const address = within(dialog).getByLabelText('Address');
    await userEvent.clear(address);
    await userEvent.type(address, 'New gate, Shibganj road');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save Site' }),
    );
    await waitFor(() => {
      const patch = sent.find((s) => s.method === 'PATCH');
      expect(patch?.url.pathname).toBe(`/api/warehouse-sites/${SITE}`);
      expect(patch?.body).toEqual({ address: 'New gate, Shibganj road' });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Close Site' }));
    dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/receipts it holds stay valid/),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close Site' }),
    );
    await waitFor(() =>
      expect(
        sent.some(
          (s) => s.url.pathname === `/api/warehouse-sites/${SITE}/close`,
        ),
      ).toBe(true),
    );

    await userEvent.click(screen.getByRole('button', { name: /Add Operator/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Rahima Khatun/ }),
    );
    await waitFor(() => {
      const put = sent.find((s) => s.method === 'PUT');
      expect(put?.url.pathname).toBe('/api/warehouse-operators/op2');
      expect(put?.body).toEqual({ siteId: SITE });
    });
  });

  it('shows others the sites without the admin’s moves', async () => {
    await signedInAs('field_officer');
    fakeServer(({ url }) =>
      url.pathname === '/api/warehouse-sites'
        ? {
            body: {
              data: [
                site({ closed: true, closedAt: '2026-10-20T00:00:00.000Z' }),
              ],
            },
          }
        : undefined,
    );
    await renderPage(<SitesPage search={{}} />, '/warehouse/sites');
    expect(await screen.findByText(/Closed since/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit Site/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Site/ })).toBeNull();
  });
});

describe('public receipt check', () => {
  it('says whether a receipt is valid, without signing in', async () => {
    await signedInAs('buyer');
    fakeServer(({ url }) =>
      url.pathname === `/api/verify/receipts/${ID}`
        ? {
            body: {
              data: {
                genuine: true,
                produce: {
                  code: 'POTATO',
                  name: 'Potato',
                  nameBn: 'আলু',
                  unit: 'kg',
                  unitBn: 'কেজি',
                },
                quantity: 2000,
                site: { name: 'Bogura Central', district: 'Bogura' },
                status: 'issued',
                expiresOn: '2027-02-01',
                expired: false,
                issuedAt: '2026-10-01T05:00:00.000Z',
                partOfLargerReceipt: false,
              },
            },
          }
        : undefined,
    );
    await renderPage(<VerifyReceiptPage id={ID} />, `/verify/receipt/${ID}`);
    expect(await screen.findByText('Valid Receipt')).toBeTruthy();
    expect(screen.getByText('Bogura Central, Bogura')).toBeTruthy();
    expect(screen.getByText('WR-3F9A2C1B')).toBeTruthy();
  });
});
