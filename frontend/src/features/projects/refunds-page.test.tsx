// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/app/navigation';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { RefundsPage } from './refunds-page';
import type { RefundsSearch } from './projects-search';

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
const due = {
  id: 'proof-1',
  reservationId: 61,
  reservationStatus: 'expired',
  projectTitle: 'Agricultural Input 12',
  investor: { id: 'i1', fullName: 'Shirin Akter' },
  amount: '20000.00',
};
const cancelled = project({
  id: 'p9',
  title: 'Cancelled Maize',
  stage: 'cancelled',
  refundTotal: '60000.00',
});
const lines = [
  {
    investor: { id: 'i2', fullName: 'Karim Mia' },
    slots: 2,
    amount: '40000.00',
    status: 'due',
  },
  {
    investor: { id: 'i3', fullName: 'Rokeya Begum' },
    slots: 1,
    amount: '20000.00',
    status: 'refunded',
  },
];

/** Proofs owed back, cancelled projects and their lines; `write` answers POSTs. */
async function page(
  role: Role,
  search: RefundsSearch = {},
  over: {
    proofs?: Reply;
    projects?: unknown[];
    write?: (sent: Sent) => Reply;
  } = {},
) {
  await signedInAs(role);
  const sent = fakeServer((s) => {
    if (s.method === 'POST') return over.write?.(s) ?? { body: { data: {} } };
    if (s.url.pathname === '/api/payment-proofs')
      return over.proofs ?? { body: { data: [due], meta: meta(1, 2) } };
    if (s.url.pathname === '/api/projects')
      return {
        body: {
          data: over.projects ?? [
            cancelled,
            project({ id: 'p8', stage: 'cancelled', refundTotal: '0.00' }),
          ],
          meta: meta(2),
        },
      };
    if (s.url.pathname === '/api/projects/p9/refunds')
      return { body: { data: lines } };
    return undefined;
  });
  const view = await renderPage(
    <RefundsPage search={search} />,
    '/projects/refunds',
  );
  return { sent, ...view };
}

describe('the refunds page', () => {
  it('lists booking refunds and cancelled projects that owe money', async () => {
    const { router, sent } = await page('accounts', { q: 'Shirin' });
    expect(
      await screen.findByRole('link', { name: 'Shirin Akter' }),
    ).toBeTruthy();
    expect(screen.getByText(/Booking #61/).textContent).toContain(
      'Booking Expired',
    );
    const asked = sent.find((s) => s.url.pathname === '/api/payment-proofs')!;
    expect(asked.url.searchParams.get('refund')).toBe('due');
    expect(asked.url.searchParams.get('q')).toBe('Shirin');

    // Only the cancelled project with money owed is listed.
    const section = await screen.findByRole('region', {
      name: 'Cancelled Maize',
    });
    expect(within(section).getByText('Owed in all: ৳ 60,000')).toBeTruthy();
    expect(await within(section).findByText('Karim Mia')).toBeTruthy();
    expect(within(section).getByText('Refunded')).toBeTruthy();
    // A record button for what is due only.
    expect(
      within(section).getAllByRole('button', { name: 'Record Refund' }),
    ).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toMatchObject({ page: 2 });
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'Karim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'Karim' });
  });

  it('records a booking refund with its reference, refusing an empty one', async () => {
    const { sent } = await page('accounts');
    const row = (
      await screen.findByRole('link', { name: 'Shirin Akter' })
    ).closest('li')!;
    await userEvent.click(
      within(row).getByRole('button', { name: 'Record Refund' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Record ৳ 20,000 Refunded to Shirin Akter'),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Refund' }),
    );
    expect(within(dialog).getByText('Enter the reference.')).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Refund Reference'),
      '  BANK-77  ',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Refund' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = sent.find((s) => s.method === 'POST')!;
    expect(posted.url.pathname).toBe('/api/payment-proofs/proof-1/refund');
    expect(posted.body).toEqual({ paymentReference: 'BANK-77' });
  });

  it('records a cancelled project’s refund, and keeps the dialog open when refused', async () => {
    let refuse = true;
    const { sent } = await page(
      'accounts',
      {},
      {
        write: () =>
          refuse
            ? {
                status: 409,
                body: {
                  statusCode: 409,
                  code: 'PAYMENT_REF_ALREADY_USED',
                  message: 'This payment reference was already used',
                },
              }
            : { body: { data: [] } },
      },
    );
    const section = await screen.findByRole('region', {
      name: 'Cancelled Maize',
    });
    await userEvent.click(
      await within(section).findByRole('button', { name: 'Record Refund' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Refund Reference'),
      'BANK-1',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Refund' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Refund' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = sent.filter((s) => s.method === 'POST').at(-1)!;
    expect(posted.url.pathname).toBe('/api/projects/p9/refunds');
    expect(posted.body).toEqual({
      investorId: 'i2',
      paymentReference: 'BANK-1',
    });
  });

  it('closes the dialog on Cancel', async () => {
    await page('accounts');
    const row = (
      await screen.findByRole('link', { name: 'Shirin Akter' })
    ).closest('li')!;
    await userEvent.click(
      within(row).getByRole('button', { name: 'Record Refund' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows auditors the refunds without the record buttons', async () => {
    await page('auditor');
    expect(
      await screen.findByRole('link', { name: 'Shirin Akter' }),
    ).toBeTruthy();
    await screen.findByText('Karim Mia');
    expect(screen.queryByRole('button', { name: 'Record Refund' })).toBeNull();
  });

  it('says when nothing is owed, or nothing matches the search', async () => {
    const none = { body: { data: [], meta: meta(0, 0) } };
    await page('accounts', {}, { proofs: none, projects: [] });
    expect(await screen.findByText('No booking refunds are due.')).toBeTruthy();
    expect(
      await screen.findByText('No cancelled project owes refunds.'),
    ).toBeTruthy();
    cleanup();
    await page('accounts', { q: 'nobody' }, { proofs: none });
    expect(await screen.findByText('No Matching People')).toBeTruthy();
  });

  it('says what went wrong, and tries again', async () => {
    let calls = 0;
    await page(
      'accounts',
      {},
      {
        get proofs() {
          return ++calls > 1
            ? { body: { data: [due], meta: meta(1) } }
            : {
                status: 500,
                body: { statusCode: 500, code: 'X', message: 'x' },
              };
        },
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByRole('link', { name: 'Shirin Akter' }),
    ).toBeTruthy();
  });

  it('closes the dialog on Escape', async () => {
    await page('accounts');
    const row = (
      await screen.findByRole('link', { name: 'Shirin Akter' })
    ).closest('li')!;
    await userEvent.click(
      within(row).getByRole('button', { name: 'Record Refund' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
