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
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  signedInAs,
} from '@/test/render';
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
const MAIZE = {
  code: 'MAIZE',
  name: 'Maize',
  nameBn: 'ভুট্টা',
  unit: 'kg',
  unitBn: 'কেজি',
};

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

describe('deals, further', () => {
  const refused = {
    status: 409,
    body: { statusCode: 409, code: 'OFFER_STATUS_INVALID', message: 'Not now' },
  };
  async function deal(
    role: Parameters<typeof signedInAs>[0],
    o: OfferDto,
    write: (path: string) => { status?: number; body: unknown } = () => ({
      body: { data: o },
    }),
  ) {
    await signedInAs(role);
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST' && url.pathname === '/api/photos')
        return { status: 201, body: { data: { id: 'ph9' } } };
      if (method === 'POST') return write(url.pathname);
      if (url.pathname === '/api/offers/12') return { body: { data: o } };
      return undefined;
    });
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    return sent;
  }

  it('has the buyer confirm what arrived, with a photo, flagging a different count', async () => {
    const forms = recordForms();
    const sent = await deal('buyer', offer({ status: 'paid' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm Delivery' }),
    );
    const dialog = await screen.findByRole('dialog');
    const qty = within(dialog).getByLabelText(/Quantity Received/);
    expect((qty as HTMLInputElement).value).toBe('500');
    await userEvent.clear(qty);
    await userEvent.type(qty, '0');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm Delivery' }),
    );
    expect(
      within(dialog).getByText('Enter a whole number, at least 1.'),
    ).toBeTruthy();
    await userEvent.clear(qty);
    await userEvent.type(qty, '480');
    expect(
      within(dialog).getByText(
        'This differs from the deal; it will be flagged.',
      ),
    ).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Condition'),
      ' Two sacks wet ',
    );
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpg'], 'sacks.jpg', { type: 'image/jpeg' }),
    );
    expect(
      await within(dialog).findByRole('button', { name: /Retake Photo/ }),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm Delivery' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(forms.at(-1)).toHaveLength(1);
    expect(
      sent.find((s) => s.url.pathname === '/api/offers/12/delivery')!.body,
    ).toEqual({
      quantity: 480,
      notes: 'Two sacks wet',
      photoId: 'ph9',
    });
  });

  it('keeps the delivery form with the reason when refused, and closes on Cancel', async () => {
    await deal('buyer', offer({ status: 'paid' }), () => refused);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm Delivery' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm Delivery' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets the buyer withdraw a pending offer, and keeps the dialog when refused', async () => {
    let refuse = true;
    const sent = await deal('buyer', offer(), () =>
      refuse ? refused : { body: { data: offer() } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Withdraw Offer' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw Offer' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw Offer' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent.some((s) => s.url.pathname === '/api/offers/12/withdraw')).toBe(
      true,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Withdraw Offer' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets an admin cancel an approved deal, and Accounts confirm its payment with a reference', async () => {
    const approved = offer({
      status: 'approved',
      external: false,
      seller: { kind: 'wegro', id: null, name: 'WeGro' } as never,
      buyerPays: '15075.00',
    });
    let sent = await deal('admin', approved);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel Deal' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel Deal',
      }),
    );
    await waitFor(() =>
      expect(
        sent.some((s) => s.url.pathname === '/api/offers/12/cancel-deal'),
      ).toBe(true),
    );
    cleanup();

    let refuse = true;
    sent = await deal('accounts', approved, () =>
      refuse ? refused : { body: { data: approved } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm Payment' }),
    );
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', {
      name: 'Confirm Payment',
    });
    await userEvent.click(send);
    expect(
      within(dialog).getByText('Enter the payment reference.'),
    ).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Payment Reference'),
      'BKASH-1',
    );
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      sent.filter((s) => s.url.pathname === '/api/offers/12/payment').at(-1)!
        .body,
    ).toEqual({
      paymentReference: 'BKASH-1',
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm Payment' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says what went wrong, and tries again', async () => {
    await signedInAs('buyer');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/offers/12'
        ? ++calls > 1
          ? { body: { data: offer() } }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } }
        : undefined,
    );
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    expect(
      (await screen.findByRole('link', { name: /Offers/ })).getAttribute(
        'href',
      ),
    ).toBe('/offers');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(
      await screen.findByRole('button', { name: 'Withdraw Offer' }),
    ).toBeTruthy();
  });
});

describe('listings, further', () => {
  const refused = {
    status: 409,
    body: {
      statusCode: 409,
      code: 'LISTING_STATUS_INVALID',
      message: 'Not now',
    },
  };
  async function view(
    role: Parameters<typeof signedInAs>[0],
    l: ListingDto,
    over: {
      offers?: OfferDto[];
      write?: () => { status?: number; body: unknown };
    } = {},
  ) {
    await signedInAs(role);
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((b: Blob) => `blob:${b.size}`),
        revokeObjectURL: vi.fn(),
      }),
    );
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST') return over.write?.() ?? { body: { data: l } };
      if (url.pathname === '/api/listings/7') return { body: { data: l } };
      if (url.pathname === '/api/offers')
        return { body: page(over.offers ?? []) };
      if (url.pathname === '/api/marketplace/fees')
        return { body: { data: { slabs: SLABS } } };
      if (url.pathname.startsWith('/api/photos/')) return { body: {} };
      return undefined;
    });
    const r = await renderPage(
      <ListingPage id={7} />,
      '/marketplace/listings/7',
    );
    return { sent, ...r };
  }

  it('shows the seller’s photos one at a time, and the offers made', async () => {
    await view(
      'admin',
      listing({ photos: ['/api/photos/a', '/api/photos/b'] }),
      {
        offers: [
          offer({ status: 'approved' }),
          offer({ id: 13, buyer: { id: 'b2', name: 'Green Mills' } }),
        ],
      },
    );
    const second = await screen.findByRole('button', {
      name: 'Photo 2 of the produce',
    });
    expect(second.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('2 offers')).toBeTruthy();
    expect(
      screen.getAllByText(/Nadia Foods|Green Mills/).length,
    ).toBeGreaterThan(0);
  });

  it('lets an admin approve a pending listing, keeping the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await view('admin', listing({ status: 'pending' }), {
      write: () => (refuse ? refused : { body: { data: listing() } }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve Listing' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Approve Listing' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Approve Listing' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent.some((s) => s.url.pathname === '/api/listings/7/approve')).toBe(
      true,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Approve Listing' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets a seller take down their own listing, unless deals wait for payment', async () => {
    const { sent } = await view(
      'seller',
      listing({ seller: { kind: 'seller', id: 'me', name: 'Me' } }),
    );
    expect(
      (await screen.findByRole('link', { name: /My Listings/ })).getAttribute(
        'href',
      ),
    ).toBe('/marketplace/mine');
    await userEvent.click(
      screen.getByRole('button', { name: 'Take Down Listing' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Take Down Listing',
      }),
    );
    await waitFor(() =>
      expect(
        sent.some((s) => s.url.pathname === '/api/listings/7/cancel'),
      ).toBe(true),
    );
    cleanup();
    await view(
      'seller',
      listing({
        seller: { kind: 'seller', id: 'me', name: 'Me' },
        unpaidDeals: 1,
      }),
    );
    expect(
      (
        await screen.findByRole('button', { name: 'Take Down Listing' })
      ).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(/A deal is waiting for payment/)).toBeTruthy();
  });

  it('keeps the turn-down and offer dialogs open with the reason when refused', async () => {
    await view('admin', listing({ status: 'pending' }), {
      write: () => refused,
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn Down' }),
    );
    let dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Reason'),
      'Blurry photos',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Turn Down' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    cleanup();

    const { sent } = await view('buyer', listing(), {
      write: () => refused,
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Make an Offer' }),
    );
    dialog = await screen.findByRole('dialog');
    const qty = within(dialog).getByLabelText(/Quantity/);
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    const price = within(dialog).getByLabelText('Your Price Per Unit');
    await userEvent.clear(price);
    await userEvent.type(price, '30');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Send Offer' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    // None at all: not sent; and the dialog closes on Escape.
    const sends = () => sent.filter((x) => x.method === 'POST').length;
    const before = sends();
    await userEvent.clear(qty);
    await userEvent.type(qty, '0');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Send Offer' }),
    );
    expect(sends()).toBe(before);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says what went wrong, and tries again', async () => {
    await signedInAs('buyer');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/listings/7'
        ? ++calls > 1
          ? { body: { data: listing() } }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } }
        : url.pathname === '/api/offers'
          ? { body: page([]) }
          : undefined,
    );
    await renderPage(<ListingPage id={7} />, '/marketplace/listings/7');
    expect(
      (await screen.findByRole('link', { name: /Listings/ })).getAttribute(
        'href',
      ),
    ).toBe('/marketplace');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(
      await screen.findByRole('button', { name: 'Make an Offer' }),
    ).toBeTruthy();
  });
});

describe('buyer requests, further', () => {
  const open: BuyerRequestDto = {
    id: 3,
    buyer: { id: 'me', name: 'Nadia Foods' },
    produce: MAIZE,
    quantity: 2000,
    maxUnitPrice: '33.00',
    validUntil: '2026-12-31',
    status: 'open',
    postedAt: '2026-10-22T05:00:00.000Z',
    matchingListings: [],
  };
  const refused = {
    status: 409,
    body: { statusCode: 409, code: 'REQUEST_NOT_OPEN', message: 'Not open' },
  };

  it('lets a buyer cancel their own open request, keeping it when refused', async () => {
    await signedInAs('buyer');
    let refuse = true;
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST')
        return refuse
          ? refused
          : { body: { data: { ...open, status: 'cancelled' } } };
      if (url.pathname === '/api/buyer-requests')
        return {
          body: {
            ...page([open]),
            meta: { page: 1, limit: 12, total: 13, totalPages: 2 },
          },
        };
      return undefined;
    });
    const { router } = await renderPage(
      <RequestsList search={{}} mine />,
      '/requests',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel Request' }),
    );
    let dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Keep It' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel Request' }),
    );
    dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel Request' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel Request' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      sent.some((s) => s.url.pathname === '/api/buyer-requests/3/cancel'),
    ).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({ tab: 'all' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.type(screen.getByRole('searchbox'), 'maize');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'maize' });
  });

  it('names what a request needs, and keeps the form with the reason when refused', async () => {
    await signedInAs('buyer');
    fakeServer(({ method, url }) => {
      if (method === 'POST')
        return {
          status: 422,
          body: {
            statusCode: 422,
            code: 'INVALID_INPUT',
            message: ['validUntil must be later'],
          },
        };
      if (url.pathname === '/api/buyer-requests') return { body: page([]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      return undefined;
    });
    await renderPage(<RequestsList search={{}} mine />, '/requests');
    expect(await screen.findByText('No buyer requests here yet.')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /Post a Request/ }),
    );
    const dialog = screen.getByRole('dialog');
    const post = within(dialog).getByRole('button', { name: 'Post a Request' });
    await userEvent.click(post);
    expect(within(dialog).getByText('Choose the produce.')).toBeTruthy();
    expect(
      within(dialog).getByText('Enter a whole number, at least 1.'),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Maize' }));
    await userEvent.type(within(dialog).getByLabelText(/Quantity/), '100');
    await userEvent.type(
      within(dialog).getByLabelText('Highest Price Per Unit'),
      '30',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Open Until'),
      '2020-01-01',
    );
    await userEvent.click(post);
    expect(
      within(dialog).getByText('Choose today or a later day.'),
    ).toBeTruthy();
    await userEvent.clear(within(dialog).getByLabelText('Open Until'));
    await userEvent.click(post);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
  });

  it('says when no request matches, and tries again after an error', async () => {
    await signedInAs('admin');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/buyer-requests'
        ? ++calls > 1
          ? { body: page([]) }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } }
        : undefined,
    );
    await renderPage(
      <RequestsList search={{ q: 'jute' }} />,
      '/marketplace/requests',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No requests match.')).toBeTruthy();
  });
});

describe('the lists, further', () => {
  const failing = (ok: () => Reply) => {
    let calls = 0;
    return (): Reply =>
      ++calls > 1
        ? ok()
        : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } };
  };

  it('asks for each deal tab, and moves between tabs, pages and searches', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/offers'
        ? {
            body: {
              ...page([offer()]),
              meta: { page: 1, limit: 12, total: 13, totalPages: 2 },
            },
          }
        : undefined,
    );
    const asked = () =>
      Object.fromEntries(
        sent.filter((s) => s.url.pathname === '/api/offers').at(-1)!.url
          .searchParams,
      );
    for (const [tab, want] of [
      ['approved', { status: 'approved' }],
      ['mismatch', { discrepancy: 'true' }],
    ] as const) {
      const { unmount } = await renderPage(
        <DealsList search={{ tab }} mode="deals" />,
        '/marketplace/deals',
      );
      await screen.findByText(/Offer #12/);
      expect(asked()).toMatchObject(want);
      unmount();
    }
    const { router } = await renderPage(
      <DealsList search={{}} mode="deliveries" />,
      '/marketplace/deliveries',
    );
    await screen.findByText(/Offer #12/);
    expect(asked()).toMatchObject({ status: 'paid' });
    await userEvent.click(screen.getByRole('tab', { name: 'Delivered' }));
    expect(router.state.location.search).toEqual({ tab: 'delivered' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.type(screen.getByRole('searchbox'), 'nadia');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'nadia' });
  });

  it('says when no deal matches, and tries again after an error', async () => {
    await signedInAs('seller');
    const answer = failing(() => ({ body: page([]) }));
    fakeServer(({ url }) =>
      url.pathname === '/api/offers' ? answer() : undefined,
    );
    await renderPage(
      <DealsList search={{ q: 'x' }} mode="deals" />,
      '/marketplace/deals',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No offers or deals match.')).toBeTruthy();
  });

  it('gives staff closed listings too, and asks for each listing tab', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? {
            body: {
              ...page([listing()]),
              meta: { page: 1, limit: 12, total: 13, totalPages: 2 },
            },
          }
        : undefined,
    );
    const asked = () =>
      Object.fromEntries(
        sent.filter((s) => s.url.pathname === '/api/listings').at(-1)!.url
          .searchParams,
      );
    let view = await renderPage(
      <ListingsList search={{ tab: 'sold_out' }} mode="browse" />,
      '/marketplace',
    );
    expect(await screen.findByRole('tab', { name: 'Cancelled' })).toBeTruthy();
    expect(asked()).toMatchObject({ status: 'sold_out' });
    view.unmount();
    view = await renderPage(
      <ListingsList search={{ tab: 'rejected' }} mode="approvals" />,
      '/marketplace/approvals',
    );
    await screen.findByRole('tab', { name: 'Not Approved' });
    expect(asked()).toMatchObject({ source: 'seller', status: 'rejected' });
    expect(screen.queryByRole('button', { name: /New Listing/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Waiting for Approval' }),
    );
    expect(view.router.state.location.search).toEqual({});
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    // The page's own tab stays in the address.
    expect(view.router.state.location.search).toEqual({
      tab: 'rejected',
      page: 2,
    });
    await userEvent.type(screen.getByRole('searchbox'), 'maize');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(view.router.state.location.search).toEqual({
      tab: 'rejected',
      q: 'maize',
    });
  });

  it('opens the right new-listing form for WeGro’s side and for an outside seller', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: catalog } : { body: page([]) },
    );
    await renderPage(
      <ListingsList search={{}} mode="browse" />,
      '/marketplace',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /New Listing/ }),
    );
    expect(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Warehouse Receipt',
      }),
    ).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    await signedInAs('seller');
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: catalog } : { body: page([]) },
    );
    await renderPage(
      <ListingsList search={{}} mode="mine" />,
      '/marketplace/mine',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /New Listing/ }),
    );
    expect(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Send for Approval',
      }),
    ).toBeTruthy();
  });

  it('says when nothing waits for approval, and tries again after an error', async () => {
    await signedInAs('admin');
    const answer = failing(() => ({ body: page([]) }));
    fakeServer(({ url }) =>
      url.pathname === '/api/listings' ? answer() : undefined,
    );
    await renderPage(
      <ListingsList search={{}} mode="approvals" />,
      '/marketplace/approvals',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByText('No listings are waiting for approval.'),
    ).toBeTruthy();
  });

  it('shows an outside seller’s first photo on the card', async () => {
    await signedInAs('buyer');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:thumb'),
        revokeObjectURL: vi.fn(),
      }),
    );
    fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? { body: page([listing({ photos: ['/api/photos/a'] })]) }
        : { body: {} },
    );
    await renderPage(
      <ListingsList search={{}} mode="browse" />,
      '/marketplace',
    );
    expect(
      (await screen.findByAltText('Photo 1 of the produce')).getAttribute(
        'src',
      ),
    ).toBe('blob:thumb');
  });
});

describe('platform fees, further', () => {
  it('works out the fee for a deal total', async () => {
    await signedInAs('buyer');
    fakeServer(() => ({ body: { data: { slabs: SLABS } } }));
    await renderPage(<FeesPage />, '/marketplace/fees');
    await userEvent.type(await screen.findByLabelText('Deal Total'), '15000');
    expect(screen.getByText('Fee per side: ৳ 75')).toBeTruthy();
  });

  it('adds a slab before the last and removes one, and shows a refusal', async () => {
    await signedInAs('super_admin');
    let refuse = true;
    const sent = fakeServer(({ method }) =>
      method === 'PUT'
        ? refuse
          ? {
              status: 422,
              body: {
                statusCode: 422,
                code: 'FEE_SLABS_INVALID',
                message: 'Rising limits only',
              },
            }
          : { body: { data: { slabs: SLABS } } }
        : { body: { data: { slabs: SLABS.slice(-2) } } },
    );
    await renderPage(<FeesPage />, '/marketplace/fees');
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit Fees/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Add Slab/ }));
    const caps = screen.getAllByLabelText('Deal Total Up To');
    const fees = screen.getAllByLabelText(/Fee/);
    await userEvent.type(caps[1]!, '900000');
    await userEvent.type(fees[1]!, '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Save Fees' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Remove Slab' })[1]!,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save Fees' }));
    await waitFor(() =>
      expect(sent.filter((s) => s.method === 'PUT').at(-1)!.body).toEqual({
        slabs: [
          { upTo: '500000', fee: '750' },
          { upTo: null, fee: '1500' },
        ],
      }),
    );
  });

  it('says what went wrong, and tries again', async () => {
    await signedInAs('buyer');
    let calls = 0;
    fakeServer(() =>
      ++calls > 1
        ? { body: { data: { slabs: SLABS } } }
        : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    await renderPage(<FeesPage />, '/marketplace/fees');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Up to ৳ 5,000')).toBeTruthy();
  });
});

describe('the marketplace, last details', () => {
  const escapeCloses = async (button: string) => {
    await userEvent.click(await screen.findByRole('button', { name: button }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };
  async function deal(role: Parameters<typeof signedInAs>[0], o: OfferDto) {
    await signedInAs(role);
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST') return { body: { data: o } };
      if (url.pathname === '/api/offers/12') return { body: { data: o } };
      return undefined;
    });
    await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
    return sent;
  }

  it('closes each move on a deal on Escape, and lets WeGro reject an offer', async () => {
    let sent = await deal('admin', offer({ external: false }));
    await escapeCloses('Reject Offer');
    await userEvent.click(screen.getByRole('button', { name: 'Reject Offer' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Reject Offer',
      }),
    );
    await waitFor(() =>
      expect(sent.some((s) => s.url.pathname === '/api/offers/12/reject')).toBe(
        true,
      ),
    );
    cleanup();
    sent = await deal('accounts', offer({ status: 'approved' }));
    await escapeCloses('Confirm Payment');
    cleanup();
    // The handler confirms too, with a photo from the phone's camera.
    await deal(
      'field_officer',
      offer({ status: 'paid', handlerDelivery: null }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm Delivery' }),
    );
    const camera = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Add Photo/,
      }),
    );
    expect(camera).toHaveBeenCalled();
    camera.mockRestore();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  async function listingAt(
    role: Parameters<typeof signedInAs>[0],
    l: ListingDto,
  ) {
    await signedInAs(role);
    fakeServer(({ url }) => {
      if (url.pathname === '/api/listings/7') return { body: { data: l } };
      if (url.pathname === '/api/offers') return { body: page([]) };
      if (url.pathname === '/api/marketplace/fees')
        return { body: { data: { slabs: SLABS } } };
      return undefined;
    });
    await renderPage(<ListingPage id={7} />, '/marketplace/listings/7');
  }

  it('closes a listing’s moves on Escape, and offers nothing once sold out', async () => {
    await listingAt('admin', listing({ status: 'pending' }));
    await escapeCloses('Approve Listing');
    await escapeCloses('Turn Down');
    cleanup();
    // A listing no longer open: nothing to do.
    // Nothing to show of the goods: no photos card.
    await listingAt('buyer', listing({ description: null, photos: [] }));
    await screen.findByRole('button', { name: 'Make an Offer' });
    expect(screen.queryByText('Dry, bagged in 50 kg sacks.')).toBeNull();
    cleanup();
    await listingAt('buyer', listing({ status: 'sold_out', available: 0 }));
    await screen.findByText('Rahim Traders', { exact: false });
    expect(screen.queryByRole('button', { name: 'Make an Offer' })).toBeNull();
  });

  it('lets an outside seller start a listing from their list', async () => {
    await signedInAs('seller');
    fakeServer(({ url }) =>
      url.pathname === '/api/listings'
        ? { body: page([]) }
        : url.pathname === '/api/catalog'
          ? { body: catalog }
          : undefined,
    );
    await renderPage(
      <ListingsList search={{}} mode="mine" />,
      '/marketplace/mine',
    );
    await escapeCloses('New Listing');
  });

  it('closes a request’s dialogs on Escape, and keeps a request with the reason when refused', async () => {
    await signedInAs('buyer');
    const open: BuyerRequestDto = {
      id: 3,
      buyer: { id: 'me', name: 'Nadia Foods' },
      produce: MAIZE,
      quantity: 2000,
      maxUnitPrice: '33.00',
      validUntil: '2026-12-31',
      status: 'open',
      postedAt: '2026-10-22T05:00:00.000Z',
      matchingListings: [],
    };
    fakeServer(({ method, url }) => {
      if (method === 'POST')
        return {
          status: 409,
          body: { statusCode: 409, code: 'REQUEST_LIMIT', message: 'x' },
        };
      if (url.pathname === '/api/buyer-requests') return { body: page([open]) };
      if (url.pathname === '/api/catalog') return { body: catalog };
      return undefined;
    });
    await renderPage(<RequestsList search={{}} mine />, '/requests');
    await escapeCloses('Cancel Request');
    await userEvent.click(
      screen.getByRole('button', { name: /Post a Request/ }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: /Produce/ }),
    );
    await userEvent.click(await screen.findByRole('option', { name: /Maize/ }));
    await userEvent.type(within(dialog).getByLabelText(/^Quantity/), '100');
    await userEvent.type(within(dialog).getByLabelText(/Price/), '30');
    await userEvent.click(within(dialog).getByRole('button', { name: /Post/ }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
