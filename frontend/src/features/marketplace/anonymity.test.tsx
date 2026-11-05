// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfferDto } from '@/api/generated/marketplace';
import type { ReceiptDetailDto } from '@/api/generated/warehouse';
import type { Role } from '@/app/navigation';
import { ReceiptPage } from '@/features/warehouse/receipt-page';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { DealPage } from './deal-page';
import { DealsList } from './deals-list';
import { ListingsList } from './listings-list';
import { RequestsList } from './requests-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MAIZE = {
  code: 'MAIZE',
  name: 'Maize',
  nameBn: 'ভুট্টা',
  unit: 'kg',
  unitBn: 'কেজি',
};
const meta = { page: 1, limit: 12, total: 1, totalPages: 1 };
const hiddenSeller = { kind: 'seller' as const, id: null, name: null };

const offer = (over: Partial<OfferDto> = {}): OfferDto => ({
  id: 12,
  listingId: 7,
  produce: MAIZE,
  buyer: { id: null, name: null },
  quantity: 500,
  unitPrice: '30.00',
  amount: '15000.00',
  status: 'paid',
  madeAt: '2026-10-21T05:00:00.000Z',
  paymentDueAt: '2099-10-28T05:00:00.000Z',
  overdue: false,
  onHold: false,
  pausedRemainingSeconds: null,
  paidAt: '2026-10-22T05:00:00.000Z',
  receiptPartId: null,
  buyerDelivery: null,
  handlerDelivery: null,
  discrepancy: false,
  deliveredAt: null,
  seller: hiddenSeller,
  external: true,
  buyerFee: '75.00',
  sellerFee: '75.00',
  buyerPays: '15075.00',
  sellerReceives: '14925.00',
  sellerPaidAt: null,
  ...over,
});

const listing = {
  id: 7,
  project: null,
  district: { code: 'BOGURA', name: 'Bogura' },
  produce: MAIZE,
  source: 'seller',
  receiptId: null,
  seller: hiddenSeller,
  quantity: 1000,
  available: 1000,
  askingUnitPrice: '32.00',
  unpaidDeals: 0,
  status: 'open',
  createdAt: '2026-10-20T05:00:00.000Z',
  closedAt: null,
  description: null,
  photos: [],
  rejectReason: null,
  decidedAt: null,
};

const request = {
  id: 3,
  buyer: { id: null, name: null },
  produce: MAIZE,
  quantity: 50,
  maxUnitPrice: '20.00',
  status: 'open',
  validUntil: '2099-01-01T00:00:00.000Z',
  postedAt: '2026-10-20T00:00:00.000Z',
  matchingListings: [],
};

/** As the API sends it: a buyer's or seller's own side of a deal carries their own id. */
const seenBy = (role: Role, o: OfferDto): OfferDto =>
  role === 'buyer'
    ? { ...o, buyer: { ...o.buyer, id: 'me' } }
    : role === 'seller'
      ? { ...o, seller: { ...o.seller, id: 'me' } as OfferDto['seller'] }
      : o;

async function deal(role: Role, given: OfferDto) {
  const o = seenBy(role, given);
  await signedInAs(role);
  fakeServer(({ url }) => {
    if (url.pathname === '/api/offers/12') return { body: { data: o } };
    if (url.pathname === '/api/offers/12/proofs') return { body: { data: [] } };
    return undefined;
  });
  await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
}

describe('who buys and who sells', () => {
  it('shows a buyer “Verified Seller” on a deal, and says WeGro arranges the handover', async () => {
    await deal('buyer', offer({ buyer: { id: 'b1', name: 'Nadia Foods' } }));
    expect(await screen.findByText('Verified Seller')).toBeTruthy();
    expect(screen.getByText('Nadia Foods')).toBeTruthy();
    expect(screen.getByText(/WeGro arranges the handover/)).toBeTruthy();
  });

  it('shows a seller “Verified Buyer” on a deal, with no link to anyone', async () => {
    await deal(
      'seller',
      offer({
        seller: { kind: 'seller', id: 's1', name: 'Rahim Traders' },
      }),
    );
    expect(await screen.findByText('Verified Buyer')).toBeTruthy();
    expect(screen.getByText('Rahim Traders')).toBeTruthy();
    expect(screen.getByText(/WeGro arranges the handover/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Verified Buyer' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Rahim Traders' })).toBeNull();
  });

  it('asks a seller confirming delivery to leave out contact details', async () => {
    await deal('seller', offer());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm Delivery' }),
    );
    expect(
      within(await screen.findByRole('dialog')).getByText(
        'Do not add phone numbers, email addresses or links.',
      ),
    ).toBeTruthy();
  });

  it('lets an admin open both people on a deal, to arrange the handover', async () => {
    await deal(
      'admin',
      offer({
        buyer: { id: 'b1', name: 'Nadia Foods' },
        seller: { kind: 'seller', id: 's1', name: 'Rahim Traders' },
      }),
    );
    expect(
      (await screen.findByRole('link', { name: 'Nadia Foods' })).getAttribute(
        'href',
      ),
    ).toBe('/people/b1');
    expect(
      screen.getByRole('link', { name: 'Rahim Traders' }).getAttribute('href'),
    ).toBe('/people/s1');
    expect(screen.queryByText(/WeGro arranges the handover/)).toBeNull();
  });

  it('gives other office staff the names, not the links', async () => {
    await deal('accounts', offer({ buyer: { id: 'b1', name: 'Nadia Foods' } }));
    expect(await screen.findByText('Nadia Foods')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Nadia Foods' })).toBeNull();
  });

  it('shows the hidden labels on deal cards, and a search by what they can use', async () => {
    await signedInAs('buyer');
    fakeServer(({ url }) =>
      url.pathname === '/api/offers'
        ? { body: { data: [offer()], meta } }
        : undefined,
    );
    await renderPage(<DealsList search={{}} mode="mine" />, '/offers');
    expect(await screen.findByText(/Verified Buyer/)).toBeTruthy();
    expect(screen.getByText(/Verified Seller/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Offer number or produce')).toBeTruthy();
  });

  it.each(['admin', 'field_officer', 'warehouse'] as const)(
    'lets a %s search deals by person',
    async (role) => {
      await signedInAs(role);
      fakeServer(({ url }) =>
        url.pathname === '/api/offers'
          ? { body: { data: [offer()], meta } }
          : undefined,
      );
      await renderPage(
        <DealsList search={{}} mode="deals" />,
        '/marketplace/deals',
      );
      expect(
        await screen.findByPlaceholderText(/buyer or seller name/),
      ).toBeTruthy();
    },
  );

  it('offers a buyer a search of listings by produce only', async () => {
    await signedInAs('buyer');
    fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? { body: { data: [listing], meta } }
        : undefined,
    );
    await renderPage(
      <ListingsList search={{}} mode="browse" />,
      '/marketplace',
    );
    expect(await screen.findByPlaceholderText('Produce')).toBeTruthy();
    expect(await screen.findByText(/Verified Seller/)).toBeTruthy();
  });

  it('offers the office a search of listings by person', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? { body: { data: [listing], meta } }
        : undefined,
    );
    await renderPage(
      <ListingsList search={{}} mode="browse" />,
      '/marketplace',
    );
    expect(await screen.findByPlaceholderText(/seller name/)).toBeTruthy();
  });

  it('shows a seller “Verified Buyer” on a request, searched by produce', async () => {
    await signedInAs('seller');
    fakeServer(({ url }) =>
      url.pathname === '/api/buyer-requests'
        ? { body: { data: [request], meta } }
        : undefined,
    );
    await renderPage(<RequestsList search={{}} />, '/marketplace/requests');
    expect(await screen.findByText('Verified Buyer')).toBeTruthy();
    expect(screen.getByPlaceholderText('Produce')).toBeTruthy();
  });

  it('shows the office a buyer’s request by name, searched by person', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/buyer-requests'
        ? {
            body: {
              data: [{ ...request, buyer: { id: 'b1', name: 'Nadia Foods' } }],
              meta,
            },
          }
        : undefined,
    );
    await renderPage(<RequestsList search={{}} />, '/marketplace/requests');
    expect(await screen.findByText('Nadia Foods')).toBeTruthy();
    expect(screen.getByPlaceholderText(/buyer name/)).toBeTruthy();
  });
});

describe('a buyer’s receipt', () => {
  const receipt = (project: { id: string; name: string }) =>
    ({
      id: `0x${'ab'.repeat(32)}`,
      project,
      site: { id: 's1', name: 'Bogura Hub' },
      owner: { kind: 'buyer', id: 'b1', name: 'Nadia Foods' },
      produce: MAIZE,
      quantity: 100,
      originalQuantity: 100,
      status: 'issued',
      pendingHandover: false,
      parentId: null,
      intake: {
        bagCount: null,
        moisturePercent: null,
        storageBay: null,
        intakeDate: '2026-10-01',
        notes: null,
      },
      expiresOn: '2099-01-01',
      expired: false,
      issuedAt: '2026-10-01T00:00:00.000Z',
      collectedAt: null,
      detailsHash: '0x00',
      verifyUrl: '/verify',
      rechecks: [],
      children: [],
    }) as unknown as ReceiptDetailDto;

  const open = async (role: Role, project: { id: string; name: string }) => {
    await signedInAs(role);
    const r = receipt(project);
    fakeServer(({ url }) =>
      url.pathname === `/api/warehouse-receipts/${r.id}`
        ? { body: { data: r } }
        : undefined,
    );
    await renderPage(<ReceiptPage id={r.id} />, `/warehouse/receipts/${r.id}`);
  };

  it('does not name or link the project', async () => {
    await open('buyer', { id: '', name: '' });
    expect(await screen.findByText('Nadia Foods')).toBeTruthy();
    expect(
      screen
        .queryAllByRole('link')
        .filter((l) => l.getAttribute('href')?.startsWith('/projects/')),
    ).toEqual([]);
  });

  it('still names it for the office', async () => {
    await open('admin', { id: 'p1', name: 'Maize Season' });
    expect(
      (await screen.findByRole('link', { name: 'Maize Season' })).getAttribute(
        'href',
      ),
    ).toBe('/projects/p1');
  });
});
