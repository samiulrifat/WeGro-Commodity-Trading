// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestDto,
  FeeSlabDto,
  ListingDto,
  OfferDto,
} from '@/api/generated/marketplace';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { DealPage } from './deal-page';
import { DealsList } from './deals-list';
import { FeesPage } from './fees-page';
import { ListingPage } from './listing-page';
import { ListingsList } from './listings-list';
import {
  addTaka,
  dealAmount,
  feeFor,
  parseMarketSearch,
  wholeNumber,
} from './market-utils';
import { RequestsList } from './requests-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages: 1 },
});

const SLABS: FeeSlabDto[] = [
  { upTo: '5000.00', fee: '20.00' },
  { upTo: '25000.00', fee: '75.00' },
  { upTo: '100000.00', fee: '250.00' },
  { upTo: '500000.00', fee: '750.00' },
  { upTo: null, fee: '1500.00' },
];
const MAIZE = { code: 'MAIZE', name: 'Maize', nameBn: 'ভুট্টা', unit: 'kg' };

const listing = (over: Partial<ListingDto> = {}): ListingDto => ({
  id: 7,
  project: null,
  district: { code: 'BOGURA', name: 'Bogura' },
  produce: MAIZE,
  source: 'seller',
  receiptId: null,
  seller: { kind: 'seller', id: 's1', name: 'Rahim Traders' },
  quantity: 1000,
  available: 1000,
  askingUnitPrice: '32.00',
  unpaidDeals: 0,
  status: 'open',
  createdAt: '2026-10-20T05:00:00.000Z',
  closedAt: null,
  description: 'Dry, bagged in 50 kg sacks.',
  photos: [],
  rejectReason: null,
  decidedAt: null,
  ...over,
});

const offer = (over: Partial<OfferDto> = {}): OfferDto => ({
  id: 12,
  listingId: 7,
  produce: MAIZE,
  buyer: { id: 'b1', name: 'Nadia Foods' },
  quantity: 500,
  unitPrice: '30.00',
  amount: '15000.00',
  status: 'pending',
  madeAt: '2026-10-21T05:00:00.000Z',
  paymentDueAt: null,
  overdue: false,
  paidAt: null,
  receiptPartId: null,
  buyerDelivery: null,
  handlerDelivery: null,
  discrepancy: false,
  deliveredAt: null,
  paymentReference: null,
  seller: { kind: 'seller', id: 's1', name: 'Rahim Traders' },
  external: true,
  buyerFee: null,
  sellerFee: null,
  buyerPays: null,
  sellerReceives: null,
  sellerPaidAt: null,
  sellerPayoutReference: null,
  ...over,
});

const catalog = {
  data: {
    version: '1',
    units: [
      {
        code: 'KG',
        name: 'Kilogram',
        nameBn: 'কেজি',
        active: true,
        sortOrder: 1,
        kind: 'mass',
        symbol: 'kg',
      },
    ],
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
    weatherEventTypes: [],
    districts: [],
  },
};

describe('marketplace helpers', () => {
  it('picks the fee slab exactly at its limit and adds money in poisha', () => {
    expect(feeFor('5000.00', SLABS)).toBe('20.00');
    expect(feeFor('5000.01', SLABS)).toBe('75.00');
    expect(feeFor('500000.00', SLABS)).toBe('750.00');
    expect(feeFor('500000.01', SLABS)).toBe('1500.00');
    expect(dealAmount(3, '33.33')).toBe('99.99');
    expect(addTaka('15000.00', '75.00')).toBe('15075.00');
    expect(wholeNumber('১,০০০')).toBe(1000);
    expect(wholeNumber('2.5')).toBeNaN();
  });

  it('keeps only well-formed search params', () => {
    expect(
      parseMarketSearch({ page: '3', q: ' maize ', tab: 'seller' }),
    ).toEqual({ page: 3, q: 'maize', tab: 'seller' });
    expect(parseMarketSearch({ page: '1', tab: 'DROP TABLE' })).toEqual({});
  });
});

describe('listings', () => {
  it('asks for outside sellers’ listings on their tab and searches', async () => {
    await signedInAs('buyer');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? { body: page([listing()]) }
        : undefined,
    );
    await renderPage(
      <ListingsList search={{ tab: 'seller', q: 'maize' }} mode="browse" />,
      '/marketplace',
    );
    expect(await screen.findByText(/Maize · ৳ 32 per kg/)).toBeTruthy();
    expect(screen.getByText('Rahim Traders')).toBeTruthy();
    // Buyers offer; they do not list.
    expect(screen.queryByRole('button', { name: /New Listing/ })).toBeNull();
    const params = sent.find((s) => s.url.pathname === '/api/listings')!.url
      .searchParams;
    expect(params.get('source')).toBe('seller');
    expect(params.get('q')).toBe('maize');
  });

  it('shows a seller every status of their own on My Listings', async () => {
    await signedInAs('seller');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? { body: page([listing({ status: 'pending' })]) }
        : undefined,
    );
    await renderPage(
      <ListingsList search={{ tab: 'rejected' }} mode="mine" />,
      '/marketplace/mine',
    );
    expect(await screen.findByText('Waiting for Approval')).toBeTruthy();
    expect(screen.getByRole('button', { name: /New Listing/ })).toBeTruthy();
    const params = sent.find((s) => s.url.pathname === '/api/listings')!.url
      .searchParams;
    expect(params.get('mine')).toBe('true');
    expect(params.get('status')).toBe('rejected');
  });

  it('lets an admin turn down a pending listing with a reason', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/listings/7')
        return { body: { data: listing({ status: 'pending' }) } };
      if (url.pathname === '/api/offers') return { body: page([]) };
      if (method === 'POST' && url.pathname === '/api/listings/7/reject')
        return { body: { data: listing({ status: 'rejected' }) } };
      return undefined;
    });
    await renderPage(<ListingPage id={7} />, '/marketplace/listings/7');
    expect(
      await screen.findByRole('button', { name: 'Approve Listing' }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Turn Down' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Blur');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Turn Down' }),
    );
    expect(
      within(dialog).getByText('Give a reason of at least 5 characters.'),
    ).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'ry photos');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Turn Down' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/listings/7/reject')?.body,
      ).toEqual({ reason: 'Blurry photos' }),
    );
  });

  it('shows a buyer the fee and total before they offer', async () => {
    await signedInAs('buyer');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/listings/7')
        return { body: { data: listing() } };
      if (url.pathname === '/api/offers') return { body: page([]) };
      if (url.pathname === '/api/marketplace/fees')
        return { body: { data: { slabs: SLABS } } };
      if (method === 'POST' && url.pathname === '/api/listings/7/offers')
        return { status: 201, body: { data: offer() } };
      return undefined;
    });
    await renderPage(<ListingPage id={7} />, '/marketplace/listings/7');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Make an Offer' }),
    );
    const dialog = screen.getByRole('dialog');
    const qty = within(dialog).getByLabelText(/Quantity/);
    await userEvent.clear(qty);
    await userEvent.type(qty, '500');
    const price = within(dialog).getByLabelText('Your Price Per Unit');
    await userEvent.clear(price);
    await userEvent.type(price, '30');
    // 500 × 30 = 15,000: the ৳75 slab.
    await waitFor(() =>
      expect(within(dialog).getByText('৳ 15,075')).toBeTruthy(),
    );
    expect(within(dialog).getByText('৳ 75')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Send Offer' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/listings/7/offers')?.body,
      ).toEqual({ quantity: 500, unitPrice: '30' }),
    );
  });
});

describe('deals', () => {
  it('lets the outside seller decide offers on their own listing, not an admin', async () => {
    await signedInAs('seller');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/offers/12') return { body: { data: offer() } };
      if (method === 'POST' && url.pathname === '/api/offers/12/approve')
        return { body: { data: offer({ status: 'approved' }) } };
      return undefined;
    });
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve Offer' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Approve Offer',
      }),
    );
    await waitFor(() =>
      expect(
        sent.some((s) => s.url.pathname === '/api/offers/12/approve'),
      ).toBe(true),
    );
    cleanup();

    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/offers/12'
        ? { body: { data: offer() } }
        : undefined,
    );
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    await screen.findByText('Money');
    expect(screen.queryByRole('button', { name: 'Approve Offer' })).toBeNull();
  });

  it('lets Accounts record the seller payout of a delivered outside deal', async () => {
    await signedInAs('accounts');
    const delivered = offer({
      status: 'delivered',
      buyerFee: '75.00',
      sellerFee: '75.00',
      buyerPays: '15075.00',
      sellerReceives: '14925.00',
      paidAt: '2026-10-21T06:00:00.000Z',
      deliveredAt: '2026-10-22T06:00:00.000Z',
    });
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/offers/12')
        return { body: { data: delivered } };
      if (method === 'POST' && url.pathname === '/api/offers/12/seller-payout')
        return { body: { data: { ...delivered, status: 'seller_paid' } } };
      return undefined;
    });
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    expect(await screen.findByText('৳ 14,925')).toBeTruthy();
    expect(screen.getAllByText('Payout Due').length).toBeGreaterThan(0);
    await userEvent.click(
      screen.getByRole('button', { name: 'Record Seller Payout' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Rahim Traders ৳ 14,925/)).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Payment Reference'),
      ' TRX 991 ',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Seller Payout' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/offers/12/seller-payout')
          ?.body,
      ).toEqual({ paymentReference: 'TRX 991' }),
    );
  });

  it('flags a delivery count that differs from the deal', async () => {
    await signedInAs('buyer');
    fakeServer(({ url }) =>
      url.pathname === '/api/offers/12'
        ? {
            body: {
              data: offer({
                status: 'paid',
                discrepancy: true,
                handlerDelivery: {
                  quantity: 480,
                  status: 'recorded',
                  recordedAt: '2026-10-22T05:00:00.000Z',
                  notes: null,
                  photoUrl: null,
                },
              }),
            },
          }
        : undefined,
    );
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    expect(
      await screen.findByText(/A confirmed quantity differs from the deal/),
    ).toBeTruthy();
    expect(screen.getByText('480 kg')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Confirm Delivery' }),
    ).toBeTruthy();
  });

  it('lists payouts due for Accounts', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/offers' ? { body: page([offer()]) } : undefined,
    );
    await renderPage(
      <DealsList search={{}} mode="payouts" />,
      '/marketplace/payouts',
    );
    await screen.findByText(/Offer #12/);
    const params = sent.find((s) => s.url.pathname === '/api/offers')!.url
      .searchParams;
    expect(params.get('payoutDue')).toBe('true');
  });
});

describe('buyer requests', () => {
  it('lets a buyer post a request and see matching listings', async () => {
    await signedInAs('buyer');
    const request: BuyerRequestDto = {
      id: 3,
      buyer: { id: 'me', name: 'Nadia Foods' },
      produce: MAIZE,
      quantity: 2000,
      maxUnitPrice: '33.00',
      validUntil: '2026-12-31',
      status: 'open',
      postedAt: '2026-10-22T05:00:00.000Z',
      matchingListings: [
        {
          id: 7,
          available: 1000,
          askingUnitPrice: '32.00',
          district: 'Bogura',
        },
      ],
    };
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/buyer-requests' && method === 'GET')
        return { body: page([request]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      if (url.pathname === '/api/buyer-requests' && method === 'POST')
        return { status: 201, body: { data: request } };
      return undefined;
    });
    await renderPage(<RequestsList search={{}} mine />, '/requests');
    expect(await screen.findByText('1 matching listing')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Listing #7/ })).toBeTruthy();
    expect(
      sent
        .find((s) => s.url.pathname === '/api/buyer-requests')!
        .url.searchParams.get('mine'),
    ).toBe('true');
    await userEvent.click(
      screen.getByRole('button', { name: /Post a Request/ }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Maize' }));
    await userEvent.type(within(dialog).getByLabelText(/Quantity/), '2000');
    await userEvent.type(
      within(dialog).getByLabelText('Highest Price Per Unit'),
      '33',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Post a Request' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toMatchObject({
        produceCode: 'MAIZE',
        quantity: 2000,
        maxUnitPrice: '33',
      }),
    );
  });
});

describe('platform fees', () => {
  it('shows everyone the table and lets only the super admin edit it', async () => {
    await signedInAs('buyer');
    fakeServer(({ url }) =>
      url.pathname === '/api/marketplace/fees'
        ? { body: { data: { slabs: SLABS } } }
        : undefined,
    );
    await renderPage(<FeesPage />, '/marketplace/fees');
    expect(await screen.findByText('Up to ৳ 5,000')).toBeTruthy();
    expect(screen.getByText('৳ 5,000.01 to ৳ 25,000')).toBeTruthy();
    expect(screen.getByText('Above ৳ 500,000')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit Fees/ })).toBeNull();
    cleanup();

    await signedInAs('super_admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/marketplace/fees')
        return { body: { data: { slabs: SLABS } } };
      return method === 'PUT'
        ? { body: { data: { slabs: SLABS } } }
        : undefined;
    });
    await renderPage(<FeesPage />, '/marketplace/fees');
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit Fees/ }),
    );
    const caps = screen.getAllByLabelText('Deal Total Up To');
    await userEvent.clear(caps[1]!);
    await userEvent.type(caps[1]!, '4000');
    await userEvent.click(screen.getByRole('button', { name: 'Save Fees' }));
    expect(screen.getByText(/Each upper limit must be more/)).toBeTruthy();
    await userEvent.clear(caps[1]!);
    await userEvent.type(caps[1]!, '30000');
    await userEvent.click(screen.getByRole('button', { name: 'Save Fees' }));
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'PUT')?.body).toEqual({
        slabs: [
          { upTo: '5000', fee: '20' },
          { upTo: '30000', fee: '75' },
          { upTo: '100000', fee: '250' },
          { upTo: '500000', fee: '750' },
          { upTo: null, fee: '1500' },
        ],
      }),
    );
  });
});
