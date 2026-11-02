// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentProofDto } from '@/api/generated/payment-proofs';
import type { ReservationDto } from '@/api/generated/projects';
import type { Role } from '@/app/navigation';
import {
  fakeServer,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { PaymentsQueue } from './payments-queue';
import type { PaymentsSearch } from './projects-search';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const meta = (total: number, totalPages = 1) => ({
  total,
  page: 1,
  limit: 20,
  totalPages,
});
const proof = (over: Partial<PaymentProofDto> = {}): PaymentProofDto =>
  ({
    id: 'proof-1',
    reservationId: 61,
    reservationStatus: 'pending',
    projectId: 'p1',
    projectTitle: 'Agricultural Input 12',
    investor: { id: 'i1', fullName: 'Shirin Akter' },
    amount: '20000.00',
    reservationAmount: '40000.00',
    method: 'bank_deposit',
    bankName: 'SONALI BANK LTD.',
    branchName: 'BOGRA BAZAR',
    districtName: 'BOGRA',
    routingNumber: '200100405',
    transferredOn: '2026-10-20',
    reference: 'DEP-55',
    note: 'Paid at the counter',
    files: [{ id: 'f1', url: '/api/payment-proofs/files/f1' }],
    status: 'pending',
    submittedAt: '2026-10-20T08:00:00Z',
    decided: { by: null, at: null },
    verifiedReference: null,
    rejectionReason: null,
    ...over,
  }) as PaymentProofDto;
const booking = (over: Partial<ReservationDto> = {}): ReservationDto =>
  ({
    id: 70,
    projectId: 'p1',
    projectTitle: 'Agricultural Input 12',
    investor: { id: 'i2', fullName: 'Karim Mia' },
    slots: 1,
    amount: '20000.00',
    status: 'pending',
    reservedAt: '2026-10-20T00:00:00Z',
    expiresAt: '2099-10-27T00:00:00Z',
    onHold: false,
    pausedRemainingSeconds: null,
    paid: '0.00',
    underReview: '0.00',
    remaining: '20000.00',
    ...over,
  }) as ReservationDto;

async function queue(
  role: Role,
  search: PaymentsSearch = {},
  over: {
    proofs?: (sent: Sent) => Reply;
    bookings?: () => Reply;
    write?: (sent: Sent) => Reply;
  } = {},
) {
  await signedInAs(role);
  const sent = fakeServer((s) => {
    if (s.method === 'POST') return over.write?.(s) ?? { body: { data: {} } };
    if (s.url.pathname === '/api/payment-proofs')
      return (
        over.proofs?.(s) ?? { body: { data: [proof()], meta: meta(1, 2) } }
      );
    if (s.url.pathname === '/api/reservations')
      return (
        over.bookings?.() ?? {
          body: {
            data: [
              booking(),
              booking({ id: 71, paid: '5000.00', onHold: true }),
            ],
            meta: meta(2),
          },
        }
      );
    return undefined;
  });
  const view = await renderPage(
    <PaymentsQueue search={search} />,
    '/projects/payments',
  );
  return { sent, ...view };
}

const refused: Reply = {
  status: 409,
  body: {
    statusCode: 409,
    code: 'PAYMENT_REF_ALREADY_USED',
    message: 'This payment reference was already used',
  },
};

describe('the payments queue', () => {
  it('shows each waiting proof in full, and moves between tabs and pages', async () => {
    const { router, sent } = await queue('accounts');
    expect(
      await screen.findByRole('link', { name: 'Shirin Akter' }),
    ).toBeTruthy();
    expect(screen.getByText('Under Review')).toBeTruthy();
    expect(screen.getByText('Bank Deposit')).toBeTruthy();
    expect(screen.getByText(/BOGRA BAZAR, BOGRA/)).toBeTruthy();
    expect(screen.getByText('200100405')).toBeTruthy();
    expect(screen.getByText(/Paid at the counter/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /File 1/ })).toBeTruthy();
    expect(
      sent
        .find((s) => s.url.pathname === '/api/payment-proofs')!
        .url.searchParams.get('status'),
    ).toBe('pending');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.click(screen.getByRole('tab', { name: 'Accepted' }));
    expect(router.state.location.search).toEqual({ tab: 'accepted' });
    await userEvent.type(screen.getByRole('searchbox'), 'shirin');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'shirin' });
  });

  it('shows who decided a proof, and the reference or the reason', async () => {
    await queue(
      'auditor',
      { tab: 'accepted' },
      {
        proofs: () => ({
          body: {
            data: [
              proof({
                status: 'accepted',
                decided: {
                  by: { id: 'a1', fullName: 'Accounts Ayesha' },
                  at: '2026-10-21T08:00:00Z',
                },
                verifiedReference: 'STMT-9',
                reference: null,
                note: 'Cash at office',
                method: 'cash',
                bankName: null,
              }),
              proof({
                id: 'proof-2',
                status: 'rejected',
                decided: {
                  by: { id: 'a1', fullName: 'Accounts Ayesha' },
                  at: '2026-10-21T09:00:00Z',
                },
                rejectionReason: 'Amount does not match',
                note: null,
              }),
            ],
            meta: meta(2),
          },
        }),
      },
    );
    expect(await screen.findByText('STMT-9')).toBeTruthy();
    expect(screen.getByText(/accepted by Accounts Ayesha/)).toBeTruthy();
    expect(screen.getByText(/rejected by Accounts Ayesha/)).toBeTruthy();
    expect(screen.getByText('Reason: Amount does not match')).toBeTruthy();
    // Auditors read; they do not decide.
    expect(screen.queryByRole('button', { name: /Accept/ })).toBeNull();
  });

  it('accepts a proof with the statement reference, which it needs', async () => {
    let refuse = true;
    const { sent } = await queue(
      'accounts',
      {},
      {
        write: () => (refuse ? refused : { body: { data: proof() } }),
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Accept/ }),
    );
    const dialog = await screen.findByRole('dialog');
    const ref = within(dialog).getByLabelText('Statement Reference');
    expect((ref as HTMLInputElement).value).toBe('DEP-55');
    await userEvent.clear(ref);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Accept' }),
    );
    expect(within(dialog).getByText('Enter the reference.')).toBeTruthy();
    await userEvent.type(ref, ' STMT-1 ');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Accept' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Accept' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = sent.filter((s) => s.method === 'POST').at(-1)!;
    expect(posted.url.pathname).toBe('/api/payment-proofs/proof-1/accept');
    expect(posted.body).toEqual({ paymentReference: 'STMT-1' });
  });

  it('rejects a proof with a reason of at least three characters', async () => {
    let refuse = true;
    const { sent } = await queue(
      'accounts',
      {},
      {
        write: () => (refuse ? refused : { body: { data: proof() } }),
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Reject/ }),
    );
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).getByLabelText('Reason (Shown to Them)');
    await userEvent.type(reason, 'no');
    const send = within(dialog).getByRole('button', {
      name: 'Reject with This Reason',
    });
    await userEvent.click(send);
    expect(
      within(dialog).getByText('Write at least 3 characters.'),
    ).toBeTruthy();
    await userEvent.type(reason, ' match');
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = sent.filter((s) => s.method === 'POST').at(-1)!;
    expect(posted.url.pathname).toBe('/api/payment-proofs/proof-1/reject');
    expect(posted.body).toEqual({ reason: 'no match' });
  });

  it('closes a decision dialog on Cancel', async () => {
    await queue('accounts');
    for (const name of [/Accept/, /Reject/]) {
      await userEvent.click(await screen.findByRole('button', { name }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Cancel',
        }),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });

  it('confirms a booking paid without a proof, with the reference', async () => {
    let refuse = true;
    const { sent } = await queue(
      'accounts',
      { tab: 'bookings' },
      {
        write: () => (refuse ? refused : { body: { data: booking() } }),
      },
    );
    expect(await screen.findAllByText('Karim Mia')).toHaveLength(2);
    expect(screen.getByText('Payment Under Review')).toBeTruthy();
    // Only the booking with nothing paid or under review is confirmed here.
    const confirm = screen.getAllByRole('button', { name: /Confirm Payment/ });
    expect(confirm).toHaveLength(1);
    await userEvent.click(confirm[0]!);
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', {
      name: 'Confirm Payment',
    });
    await userEvent.click(send);
    expect(within(dialog).getByText('Enter the reference.')).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Statement Reference'),
      'CASH-3',
    );
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = sent.filter((s) => s.method === 'POST').at(-1)!;
    expect(posted.url.pathname).toBe('/api/reservations/70/confirm');
    expect(posted.body).toEqual({ paymentReference: 'CASH-3' });

    await userEvent.click(
      screen.getAllByRole('button', { name: /Confirm Payment/ })[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says when a tab is empty or nothing matches, and tries again after an error', async () => {
    const none: Reply = { body: { data: [], meta: meta(0, 0) } };
    await queue('accounts', { tab: 'rejected' }, { proofs: () => none });
    expect(await screen.findByText('No rejected proofs.')).toBeTruthy();
    cleanup();
    await queue('accounts', { q: 'nobody' }, { proofs: () => none });
    expect(await screen.findByText('No Matching People')).toBeTruthy();
    cleanup();
    await queue('accounts', { tab: 'bookings' }, { bookings: () => none });
    expect(
      await screen.findByText('No bookings are awaiting payment.'),
    ).toBeTruthy();
    cleanup();
    await queue(
      'accounts',
      { tab: 'bookings', q: 'x' },
      { bookings: () => none },
    );
    expect(await screen.findByText('No Matching People')).toBeTruthy();
    cleanup();

    const broken: Reply = {
      status: 500,
      body: { statusCode: 500, code: 'X', message: 'x' },
    };
    let proofCalls = 0;
    await queue(
      'accounts',
      {},
      {
        proofs: () => (++proofCalls > 1 ? none : broken),
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No proofs are waiting.')).toBeTruthy();
    cleanup();
    let bookingCalls = 0;
    await queue(
      'accounts',
      { tab: 'bookings' },
      {
        bookings: () => (++bookingCalls > 1 ? none : broken),
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByText('No bookings are awaiting payment.'),
    ).toBeTruthy();
  });

  it('closes each dialog on Escape, and pages the bookings', async () => {
    const { router } = await queue(
      'accounts',
      { tab: 'bookings' },
      {
        bookings: () => ({
          body: { data: [booking()], meta: meta(25, 2) },
        }),
      },
    );
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Confirm Payment/ }))[0]!,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toMatchObject({ page: 2 });
    cleanup();
    await queue('accounts');
    for (const name of [/Accept/, /Reject/]) {
      await userEvent.click(await screen.findByRole('button', { name }));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
  });
});
