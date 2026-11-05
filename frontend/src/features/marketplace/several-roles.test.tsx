// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestDto,
  ListingDto,
  OfferDto,
} from '@/api/generated/marketplace';
import { AccountMenu } from '@/app/shell/account-menu';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { DealPage } from './deal-page';
import { DealsList } from './deals-list';
import { ListingPage } from './listing-page';
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
const mine = { kind: 'seller' as const, id: 'me', name: 'Salma Traders' };

const offer = (over: Partial<OfferDto> = {}): OfferDto => ({
  id: 12,
  listingId: 7,
  produce: MAIZE,
  buyer: { id: null, name: null },
  quantity: 500,
  unitPrice: '30.00',
  amount: '15000.00',
  status: 'pending',
  madeAt: '2026-10-21T05:00:00.000Z',
  paymentDueAt: '2099-10-28T05:00:00.000Z',
  overdue: false,
  onHold: false,
  pausedRemainingSeconds: null,
  paidAt: null,
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

/** They sell this one: the buyer is hidden, and no money figures come. */
const selling = (over: Partial<OfferDto> = {}) =>
  offer({ seller: mine, ...over });
/** They buy this one: the seller is hidden, and the money figures come. */
const buying = (over: Partial<OfferDto> = {}) =>
  offer({
    buyer: { id: 'me', name: 'Salma Traders' },
    paid: '0.00',
    underReview: '0.00',
    remaining: '15075.00',
    ...over,
  });

const listing = (over: Partial<ListingDto> = {}): ListingDto => ({
  id: 7,
  project: null,
  district: { code: 'BOGURA', name: 'Bogura' },
  produce: MAIZE,
  source: 'seller',
  receiptId: null,
  seller: hiddenSeller,
  quantity: 1000,
  available: 1000,
  askingUnitPrice: '30.00',
  unpaidDeals: 0,
  status: 'open',
  createdAt: '2026-10-20T05:00:00.000Z',
  closedAt: null,
  description: 'Sorted and bagged',
  photos: [],
  rejectReason: null,
  decidedAt: null,
  ...over,
});

const request = (over: Partial<BuyerRequestDto> = {}): BuyerRequestDto =>
  ({
    id: 3,
    buyer: { id: null, name: null },
    produce: MAIZE,
    quantity: 50,
    maxUnitPrice: '20.00',
    status: 'open',
    validUntil: '2099-01-01T00:00:00.000Z',
    postedAt: '2026-10-20T00:00:00.000Z',
    matchingListings: [],
    ...over,
  }) as BuyerRequestDto;

const button = (name: string) => screen.queryByRole('button', { name });

async function deal(o: OfferDto) {
  await signedInAs('buyer', ['seller']);
  fakeServer(({ url }) => {
    if (url.pathname === '/api/offers/12') return { body: { data: o } };
    if (url.pathname === '/api/offers/12/proofs') return { body: { data: [] } };
    if (url.pathname === '/api/payment-accounts') return { body: { data: [] } };
    return undefined;
  });
  await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
}

async function listingPage(l: ListingDto, offers: OfferDto[] = []) {
  await signedInAs('buyer', ['seller']);
  fakeServer(({ url }) => {
    if (url.pathname === '/api/listings/7') return { body: { data: l } };
    if (url.pathname === '/api/offers') return { body: { data: offers, meta } };
    return undefined;
  });
  await renderPage(<ListingPage id={7} />, '/marketplace/listings/7');
}

describe('someone who both buys and sells', () => {
  describe('on a deal of their own listing', () => {
    it('decides the offer, and cannot withdraw or pay as if they had made it', async () => {
      await deal(selling());
      expect(
        await screen.findByRole('button', { name: 'Approve Offer' }),
      ).toBeTruthy();
      expect(button('Reject Offer')).toBeTruthy();
      expect(button('Withdraw Offer')).toBeNull();
      expect(button('Upload Payment Proof')).toBeNull();
    });

    it('does not see who is buying', async () => {
      await deal(selling());
      expect(await screen.findByText('Verified Buyer')).toBeTruthy();
    });

    it('confirms the handover as the seller, and goes back to the deals', async () => {
      await deal(selling({ status: 'paid' }));
      expect(
        await screen.findByRole('button', { name: 'Confirm Delivery' }),
      ).toBeTruthy();
      expect(screen.getByText(/WeGro arranges the handover/)).toBeTruthy();
      expect(
        screen
          .getByRole('link', { name: 'Offers & Deals' })
          .getAttribute('href'),
      ).toBe('/marketplace/deals');
    });

    it('has no delivery to confirm once their side is recorded', async () => {
      await deal(
        selling({
          status: 'paid',
          handlerDelivery: {
            quantity: 500,
            notes: null,
            photoUrl: null,
            status: 'recorded',
            recordedAt: '2026-10-22T05:00:00.000Z',
          },
        }),
      );
      await screen.findByText('Verified Buyer');
      expect(button('Confirm Delivery')).toBeNull();
    });
  });

  describe('on a deal they are buying', () => {
    it('withdraws their own offer, and cannot decide it', async () => {
      await deal(buying());
      expect(
        await screen.findByRole('button', { name: 'Withdraw Offer' }),
      ).toBeTruthy();
      expect(button('Approve Offer')).toBeNull();
      expect(button('Reject Offer')).toBeNull();
    });

    it('does not see who is selling, and goes back to their offers', async () => {
      await deal(buying());
      expect(await screen.findByText('Verified Seller')).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'My Offers' }).getAttribute('href'),
      ).toBe('/offers');
    });

    it('pays for it once approved', async () => {
      await deal(buying({ status: 'approved' }));
      expect(
        await screen.findByRole('button', { name: 'Upload Payment Proof' }),
      ).toBeTruthy();
    });

    it('confirms what arrived as the buyer', async () => {
      await deal(buying({ status: 'paid' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Confirm Delivery' }),
      );
      expect(await screen.findByRole('dialog')).toBeTruthy();
    });
  });

  describe('on a listing', () => {
    it('makes no offer on their own, and manages it', async () => {
      await listingPage(listing({ seller: mine }));
      expect(
        await screen.findByRole('button', { name: 'Take Down Listing' }),
      ).toBeTruthy();
      expect(button('Make an Offer')).toBeNull();
      expect(screen.getByText('Offers')).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'My Listings' }).getAttribute('href'),
      ).toBe('/marketplace/mine');
    });

    it('offers on someone else’s, and cannot take it down', async () => {
      await listingPage(listing());
      expect(
        await screen.findByRole('button', { name: 'Make an Offer' }),
      ).toBeTruthy();
      expect(button('Take Down Listing')).toBeNull();
      expect(screen.getByText('Your Offers')).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'Listings' }).getAttribute('href'),
      ).toBe('/marketplace');
    });

    it('may add a listing of their own', async () => {
      await signedInAs('buyer', ['seller']);
      fakeServer(({ url }) =>
        url.pathname === '/api/listings'
          ? { body: { data: [listing({ seller: mine })], meta } }
          : undefined,
      );
      await renderPage(
        <ListingsList search={{}} mode="mine" />,
        '/marketplace/mine',
      );
      expect(
        await screen.findByRole('button', { name: /New Listing/ }),
      ).toBeTruthy();
    });
  });

  describe('among buyer requests', () => {
    async function requests(r: BuyerRequestDto) {
      await signedInAs('buyer', ['seller']);
      fakeServer(({ url }) =>
        url.pathname === '/api/buyer-requests'
          ? { body: { data: [r], meta } }
          : undefined,
      );
      await renderPage(<RequestsList search={{}} />, '/marketplace/requests');
    }

    it('lists to answer someone else’s', async () => {
      await requests(request());
      expect(
        await screen.findByRole('button', { name: /List This Produce/ }),
      ).toBeTruthy();
      expect(button('Cancel Request')).toBeNull();
    });

    it('cancels their own, and does not answer it', async () => {
      await requests(request({ buyer: { id: 'me', name: 'Salma Traders' } }));
      expect(
        await screen.findByRole('button', { name: 'Cancel Request' }),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: /List This Produce/ }),
      ).toBeNull();
    });
  });

  describe('in the lists of deals', () => {
    const asked = async (
      mode: 'mine' | 'deals' | 'deliveries' | 'payouts',
      extra?: Parameters<typeof signedInAs>[1],
      role: Parameters<typeof signedInAs>[0] = 'buyer',
    ) => {
      cleanup();
      await signedInAs(role, extra);
      const sent = fakeServer(({ url }) =>
        url.pathname === '/api/offers'
          ? { body: { data: [], meta: { ...meta, total: 0 } } }
          : undefined,
      );
      await renderPage(<DealsList search={{}} mode={mode} />, '/offers');
      await screen.findByRole('tablist');
      await vi.waitFor(() =>
        expect(sent.some((s) => s.url.pathname === '/api/offers')).toBe(true),
      );
      return sent
        .find((s) => s.url.pathname === '/api/offers')!
        .url.searchParams.get('side');
    };

    it('sees what they are buying under My Offers', async () => {
      await expect(asked('mine', ['seller'])).resolves.toBe('buying');
    });

    it.each(['deals', 'deliveries', 'payouts'] as const)(
      'sees what they are selling under %s',
      async (mode) => {
        await expect(asked(mode, ['seller'])).resolves.toBe('selling');
      },
    );

    it('asks for no side for someone on just one', async () => {
      await expect(asked('mine')).resolves.toBeNull();
      await expect(asked('deals', undefined, 'seller')).resolves.toBeNull();
      // Investing does not make them both.
      await expect(asked('mine', ['investor'])).resolves.toBeNull();
    });
  });

  it('shows every role beside their name', async () => {
    await signedInAs('investor', ['buyer', 'seller']);
    fakeServer(() => undefined);
    await renderPage(<AccountMenu />, '/');
    expect(await screen.findByText('Investor, Buyer, Seller')).toBeTruthy();
  });
});
