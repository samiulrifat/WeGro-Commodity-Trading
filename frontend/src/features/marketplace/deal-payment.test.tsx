// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DealProofDto, OfferDto } from '@/api/generated/marketplace';
import type { Role } from '@/app/navigation';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { DealPage } from './deal-page';
import { DealPaymentsQueue } from './deal-payments-queue';
import type { MarketSearch } from './market-utils';

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

const offer = (over: Partial<OfferDto> = {}): OfferDto => ({
  id: 12,
  listingId: 7,
  produce: MAIZE,
  buyer: { id: 'b1', name: 'Nadia Foods' },
  quantity: 500,
  unitPrice: '30.00',
  amount: '15000.00',
  status: 'approved',
  madeAt: '2026-10-21T05:00:00.000Z',
  paymentDueAt: '2099-10-28T05:00:00.000Z',
  overdue: false,
  onHold: false,
  pausedRemainingSeconds: null,
  paid: '0.00',
  underReview: '0.00',
  remaining: '15075.00',
  paidAt: null,
  receiptPartId: null,
  buyerDelivery: null,
  handlerDelivery: null,
  discrepancy: false,
  deliveredAt: null,
  seller: { kind: 'seller', id: 's1', name: 'Rahim Traders' },
  external: true,
  buyerFee: '75.00',
  sellerFee: '75.00',
  buyerPays: '15075.00',
  sellerReceives: '14925.00',
  sellerPaidAt: null,
  ...over,
});

const proof = (over: Partial<DealProofDto> = {}): DealProofDto => ({
  id: 'proof-1',
  offerId: 12,
  produce: MAIZE,
  quantity: 500,
  buyer: { id: 'b1', fullName: 'Nadia Foods' },
  amount: '5000.00',
  dealTotal: '15075.00',
  dealStatus: 'approved',
  transferredOn: '2026-10-22',
  method: 'bank_deposit',
  bankName: 'SONALI BANK LTD.',
  branchName: 'BOGRA BAZAR',
  districtName: 'BOGRA',
  routingNumber: '200100405',
  reference: 'DEP-55',
  note: null,
  files: [
    {
      id: 'f1',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
      url: '/api/deal-proofs/files/f1',
    },
  ],
  status: 'pending',
  submittedAt: '2026-10-22T08:00:00Z',
  decided: { by: null, at: null },
  rejectionReason: null,
  refund: 'none',
  refundedAt: null,
  ...over,
});

/** As the API sends it: a buyer's or seller's own side of a deal carries their own id. */
const seenBy = (role: Role, o: OfferDto): OfferDto =>
  role === 'buyer'
    ? { ...o, buyer: { ...o.buyer, id: 'me' } }
    : role === 'seller'
      ? { ...o, seller: { ...o.seller, id: 'me' } as OfferDto['seller'] }
      : o;

/** The deal page, with WeGro's account and the bank list behind it. */
async function dealPage(
  role: Role,
  given: OfferDto,
  proofs: DealProofDto[] = [],
  write: (s: Sent) => Reply = () => ({ status: 201, body: { data: {} } }),
) {
  const o = seenBy(role, given);
  await signedInAs(role);
  const sent = fakeServer((s) => {
    const { method, url } = s;
    if (method === 'POST') return write(s);
    if (url.pathname === '/api/offers/12') return { body: { data: o } };
    if (url.pathname === '/api/offers/12/proofs')
      return { body: { data: proofs } };
    if (url.pathname === '/api/payment-accounts') {
      return {
        body: {
          data: [
            {
              id: 'a1',
              bankName: 'UNITED COMMERCIAL BANK LTD.',
              branchName: 'TEJGAON',
              routingNumber: '245264485',
              accountName: 'WEGRO TECHNOLOGIES LTD',
              accountNumber: '1042112000000463',
              active: true,
              sortOrder: 0,
              updatedAt: '2026-10-20T00:00:00.000Z',
            },
          ],
        },
      };
    }
    if (url.pathname === '/api/bank-list/banks')
      return { body: { data: [{ code: 200, name: 'SONALI BANK LTD.' }] } };
    if (url.pathname === '/api/bank-list/banks/200/districts')
      return { body: { data: [{ code: 610, name: 'BOGRA' }] } };
    if (url.pathname === '/api/bank-list/banks/200/districts/610/branches') {
      return {
        body: {
          data: [{ routingNumber: '200100405', name: 'BOGRA BAZAR' }],
        },
      };
    }
    return undefined;
  });
  await renderPage(<DealPage id={12} />, '/marketplace/deals/12');
  return sent;
}

const upload = () =>
  screen.findByRole('button', { name: /Upload Payment Proof/ });

describe('paying for a deal, as the buyer', () => {
  it('shows the time left, WeGro’s account and the exact amount with the fee', async () => {
    await dealPage('buyer', offer());
    expect(await screen.findByText('WEGRO TECHNOLOGIES LTD')).toBeTruthy();
    expect(screen.getByText('245264485')).toBeTruthy();
    expect(screen.getByText(/Pay within/)).toBeTruthy();
    expect(screen.getByText(/to secure your deal/)).toBeTruthy();
    expect(screen.getByText(/You still need to pay/)).toBeTruthy();
    expect(screen.getByText('Exact Transfer Amount')).toBeTruthy();
    expect(screen.getAllByText(/15,075/).length).toBeGreaterThan(1);
    // Accounts' move is not the buyer's.
    expect(
      screen.queryByRole('button', { name: 'Confirm Payment' }),
    ).toBeNull();
    // No second deadline in the header: the banner says it.
    expect(screen.queryByText(/^Pay by/)).toBeNull();
  });

  it('asks a deposit’s bank, then district, then branch, fills in the routing number and sends it', async () => {
    const forms = recordForms();
    const sent = await dealPage('buyer', offer());
    await userEvent.click(await upload());
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    expect(within(dialog).getByText('Choose the bank.')).toBeTruthy();
    expect(within(dialog).getByText('Attach at least one file.')).toBeTruthy();

    const choose = async (label: string, typed: string, option: string) => {
      const box = within(dialog).getByLabelText(label, { selector: 'input' });
      await waitFor(() => expect(box.hasAttribute('disabled')).toBe(false));
      await userEvent.type(box, typed);
      await userEvent.click(
        await screen.findByRole('option', { name: option }),
      );
    };
    await choose('Bank Name', 'sona', 'SONALI BANK LTD.');
    await choose('District', 'bog', 'BOGRA');
    await choose('Branch', 'bazar', 'BOGRA BAZAR');
    const routing =
      within(dialog).getByLabelText<HTMLInputElement>('Routing Number');
    expect(routing.value).toBe('200100405');
    expect(routing.readOnly).toBe(true);

    await userEvent.upload(
      within(dialog).getByLabelText('Payment Proof'),
      new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.url.pathname).toBe(
        '/api/offers/12/proofs',
      ),
    );
    expect(Object.fromEntries(forms.at(-1)!)).toMatchObject({
      // The form starts on all that is left, the fee included.
      amount: '15075',
      method: 'bank_deposit',
      routingNumber: '200100405',
      files: 'slip.pdf',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sends part of the amount in cash, refusing more than is left', async () => {
    const forms = recordForms();
    await dealPage('buyer', offer());
    await userEvent.click(await upload());
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Amount Transferred');
    await userEvent.clear(amount);
    await userEvent.type(amount, '15075.01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cash' }));
    await userEvent.upload(
      within(dialog).getByLabelText('Payment Proof'),
      new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    expect(
      within(dialog).getByText(/Enter an amount above zero and at most/),
    ).toBeTruthy();
    await userEvent.clear(amount);
    await userEvent.type(amount, '5000');
    await userEvent.type(
      within(dialog).getByLabelText('Transaction or Cheque Number'),
      'CASH-1',
    );
    await userEvent.type(within(dialog).getByLabelText('Note'), 'First part');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    await waitFor(() =>
      expect(Object.fromEntries(forms.at(-1)!)).toMatchObject({
        amount: '5000',
        method: 'cash',
        reference: 'CASH-1',
        note: 'First part',
      }),
    );
    expect(Object.fromEntries(forms.at(-1)!)).not.toHaveProperty(
      'routingNumber',
    );
  });

  it('keeps the form open with the reason when the proof is refused', async () => {
    recordForms();
    await dealPage('buyer', offer(), [], () => ({
      status: 409,
      body: {
        statusCode: 409,
        code: 'PAYMENT_OVERDUE',
        message: 'The payment deadline for this deal has passed',
      },
    }));
    await userEvent.click(await upload());
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cash' }));
    await userEvent.upload(
      within(dialog).getByLabelText('Payment Proof'),
      new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('says the clock is stopped while a proof is checked, and offers the rest', async () => {
    await dealPage(
      'buyer',
      offer({
        onHold: true,
        pausedRemainingSeconds: 7200,
        underReview: '5000.00',
        remaining: '10075.00',
      }),
      [proof()],
    );
    expect(await screen.findByText('Your Payments')).toBeTruthy();
    expect(screen.getAllByText('Payment Under Review').length).toBe(1);
    expect(
      screen.getByText(/the clock is stopped with 2h 0m left/),
    ).toBeTruthy();
    expect(screen.getByText(/BOGRA BAZAR/)).toBeTruthy();
    expect(await upload()).toBeTruthy();
  });

  it('offers no upload when all is sent, and shows why a proof was turned down', async () => {
    await dealPage(
      'buyer',
      offer({
        onHold: true,
        pausedRemainingSeconds: 60,
        underReview: '15075.00',
        remaining: '0.00',
      }),
      [
        proof({ amount: '15075.00' }),
        proof({
          id: 'proof-2',
          status: 'rejected',
          rejectionReason: 'Not on the statement',
        }),
      ],
    );
    expect(await screen.findByText(/Not on the statement/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Upload Payment Proof/ }),
    ).toBeNull();
    expect(screen.queryByText('Exact Transfer Amount')).toBeNull();
  });

  it('offers no upload once the deadline has passed', async () => {
    await dealPage('buyer', offer({ overdue: true }));
    expect(
      await screen.findByText(/The payment deadline has passed/),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Upload Payment Proof/ }),
    ).toBeNull();
    expect(screen.queryByText(/Pay within/)).toBeNull();
  });

  it('says money sent for a deal that ended comes back', async () => {
    await dealPage(
      'buyer',
      offer({ status: 'cancelled', paid: '5000.00', remaining: '10075.00' }),
      [proof({ status: 'accepted', dealStatus: 'cancelled', refund: 'due' })],
    );
    expect(await screen.findByText('To be refunded by WeGro.')).toBeTruthy();
    expect(screen.queryByText(/You still need to pay/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Upload Payment Proof/ }),
    ).toBeNull();
  });
});

describe('a deal’s payment, for others', () => {
  it('lets Accounts confirm outright only while nothing was sent', async () => {
    await dealPage('accounts', offer());
    expect(
      await screen.findByRole('button', { name: 'Confirm Payment' }),
    ).toBeTruthy();
    cleanup();
    await dealPage(
      'accounts',
      offer({ onHold: true, underReview: '5000.00', remaining: '10075.00' }),
      [proof()],
    );
    expect(await screen.findByText('Payments Sent')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Confirm Payment' }),
    ).toBeNull();
    // On hold, in the header for everyone but the buyer.
    expect(screen.getByText('Payment Under Review')).toBeTruthy();
  });

  it('lets Accounts accept a proof on the deal itself, with the statement reference', async () => {
    const sent = await dealPage(
      'accounts',
      offer({ onHold: true, underReview: '5000.00', remaining: '10075.00' }),
      [proof()],
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Accept' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/covers? what the buyer pays/),
    ).toBeTruthy();
    const box = within(dialog).getByLabelText<HTMLInputElement>(
      'Statement Reference',
    );
    expect(box.value).toBe('DEP-55');
    await userEvent.clear(box);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Accept' }),
    );
    expect(within(dialog).getByText('Enter the reference.')).toBeTruthy();
    await userEvent.type(box, 'STMT-1');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Accept' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/deal-proofs/proof-1/accept')
          ?.body,
      ).toEqual({ paymentReference: 'STMT-1' }),
    );
  });

  it('lets Accounts reject a proof, saying why, and shows what refuses it', async () => {
    let refuse = true;
    const sent = await dealPage(
      'accounts',
      offer({ onHold: true, underReview: '5000.00', remaining: '10075.00' }),
      [proof()],
      () =>
        refuse
          ? {
              status: 409,
              body: {
                statusCode: 409,
                code: 'PROOF_ALREADY_DECIDED',
                message: 'This proof is already accepted',
                details: { status: 'accepted' },
              },
            }
          : { body: { data: {} } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reject' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/their deal clock runs again/),
    ).toBeTruthy();
    const reason = within(dialog).getByRole('textbox');
    await userEvent.type(reason, 'No');
    const send = within(dialog).getByRole('button', { name: /Reject/ });
    await userEvent.click(send);
    expect(within(dialog).getByText(/at least/)).toBeTruthy();
    await userEvent.type(reason, 't on the statement');
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() =>
      expect(
        sent
          .filter((s) => s.url.pathname === '/api/deal-proofs/proof-1/reject')
          .at(-1)?.body,
      ).toEqual({ reason: 'Not on the statement' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the auditor the proofs without any move on them', async () => {
    await dealPage(
      'auditor',
      offer({ onHold: true, underReview: '5000.00', remaining: '10075.00' }),
      [proof()],
    );
    expect(await screen.findByText('Payments Sent')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('asks for no proofs and shows no figures to the seller’s side', async () => {
    const seller = offer();
    delete seller.paid;
    delete seller.underReview;
    delete seller.remaining;
    const sent = await dealPage('seller', { ...seller, onHold: true });
    expect(await screen.findByText('Payment Under Review')).toBeTruthy();
    expect(screen.queryByText('Payment Progress')).toBeNull();
    expect(sent.some((s) => s.url.pathname.endsWith('/proofs'))).toBe(false);
  });

  it('hides the progress of a finished deal paid without proofs', async () => {
    await dealPage(
      'accounts',
      offer({ status: 'paid', paid: '0.00', remaining: '15075.00' }),
    );
    await screen.findByText('Maize', { exact: false });
    await waitFor(() =>
      expect(screen.queryByText('Payment Progress')).toBeNull(),
    );
  });
});

describe('Accounts’ buyer payments page', () => {
  const meta = (total: number, totalPages = 1) => ({
    total,
    page: 1,
    limit: 20,
    totalPages,
  });

  async function queue(
    role: Role,
    search: MarketSearch = {},
    over: {
      proofs?: (s: Sent) => Reply;
      deals?: () => Reply;
      write?: (s: Sent) => Reply;
    } = {},
  ) {
    await signedInAs(role);
    const sent = fakeServer((s) => {
      if (s.method === 'POST') return over.write?.(s) ?? { body: { data: {} } };
      if (s.url.pathname === '/api/deal-proofs')
        return (
          over.proofs?.(s) ?? { body: { data: [proof()], meta: meta(1, 2) } }
        );
      if (s.url.pathname === '/api/offers')
        return (
          over.deals?.() ?? { body: { data: [offer()], meta: meta(1, 2) } }
        );
      return undefined;
    });
    const view = await renderPage(
      <DealPaymentsQueue search={search} />,
      '/marketplace/payments',
    );
    return { sent, ...view };
  }

  const errored: Reply = {
    status: 500,
    body: { statusCode: 500, message: 'Down' },
  };

  it('shows each waiting proof in full, and moves between tabs and pages', async () => {
    const { router, sent } = await queue('accounts');
    expect(await screen.findByText('Nadia Foods')).toBeTruthy();
    expect(screen.getByText(/Offer #12/)).toBeTruthy();
    expect(screen.getByText(/BOGRA BAZAR, BOGRA/)).toBeTruthy();
    expect(screen.getByText('200100405')).toBeTruthy();
    expect(screen.getByRole('button', { name: /File 1/ })).toBeTruthy();
    expect(
      sent
        .find((s) => s.url.pathname === '/api/deal-proofs')!
        .url.searchParams.get('status'),
    ).toBe('pending');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.click(screen.getByRole('tab', { name: 'Accepted' }));
    expect(router.state.location.search).toEqual({ tab: 'accepted' });
    await userEvent.type(screen.getByRole('searchbox'), 'nadia');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'nadia' });
    await userEvent.click(screen.getByRole('tab', { name: 'Waiting' }));
    expect(router.state.location.search).toEqual({});
  });

  it('says when each list is empty, or nothing matches', async () => {
    const none = { body: { data: [], meta: meta(0) } };
    for (const [tab, words] of [
      [undefined, 'No proofs are waiting.'],
      ['accepted', 'No accepted proofs yet.'],
      ['rejected', 'No rejected proofs.'],
      ['deals', 'No deals are awaiting payment.'],
      ['refunds', 'No deal refunds are due.'],
    ] as const) {
      await queue(
        'accounts',
        { tab },
        { proofs: () => none, deals: () => none },
      );
      expect(await screen.findByText(words)).toBeTruthy();
      cleanup();
      await queue(
        'accounts',
        { tab, q: 'nobody' },
        { proofs: () => none, deals: () => none },
      );
      expect(await screen.findByText('No Matching People')).toBeTruthy();
      cleanup();
    }
  });

  it('says what went wrong on each list, and tries again', async () => {
    for (const tab of [undefined, 'deals', 'refunds'] as const) {
      const { sent } = await queue(
        'accounts',
        { tab },
        { proofs: () => errored, deals: () => errored },
      );
      const again = await screen.findByRole('button', { name: /Try Again/i });
      const before = sent.length;
      await userEvent.click(again);
      await waitFor(() => expect(sent.length).toBeGreaterThan(before));
      cleanup();
    }
  });

  it('lists the deals awaiting payment, with what has come in, each opening the deal', async () => {
    const { router, sent } = await queue(
      'accounts',
      { tab: 'deals' },
      {
        deals: () => ({
          body: {
            data: [
              offer({ paid: '1000.00' }),
              offer({ id: 13, onHold: true, underReview: '500.00' }),
            ],
            meta: meta(2, 2),
          },
        }),
      },
    );
    expect(await screen.findAllByRole('link', { name: /Maize/ })).toHaveLength(
      2,
    );
    expect(screen.getByText(/Payment Under Review/)).toBeTruthy();
    expect(screen.getAllByText(/Accepted:/).length).toBe(2);
    expect(
      sent
        .find((s) => s.url.pathname === '/api/offers')!
        .url.searchParams.get('status'),
    ).toBe('approved');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ tab: 'deals', page: 2 });
  });

  it('records a refund due, with its reference, and only Accounts may', async () => {
    const due = {
      body: {
        data: [
          proof({
            status: 'accepted',
            dealStatus: 'cancelled',
            refund: 'due',
          }),
        ],
        meta: meta(1, 2),
      },
    };
    const { sent, router } = await queue(
      'accounts',
      { tab: 'refunds' },
      { proofs: () => due },
    );
    expect(await screen.findByText(/Cancelled/)).toBeTruthy();
    expect(
      sent
        .find((s) => s.url.pathname === '/api/deal-proofs')!
        .url.searchParams.get('refund'),
    ).toBe('due');
    await userEvent.click(
      screen.getByRole('button', { name: 'Record Refund' }),
    );
    const dialog = await screen.findByRole('dialog');
    const box = within(dialog).getByLabelText('Refund Reference');
    await userEvent.type(box, 'BACK-1');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Refund' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/deal-proofs/proof-1/refund')
          ?.body,
      ).toEqual({ paymentReference: 'BACK-1' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ tab: 'refunds', page: 2 });
    cleanup();

    await queue('auditor', { tab: 'refunds' }, { proofs: () => due });
    expect(await screen.findByText(/Cancelled/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record Refund' })).toBeNull();
  });
});
