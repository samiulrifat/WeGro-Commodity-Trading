// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReservationDto } from '@/api/generated/projects';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  signedInAs,
} from '@/test/render';
import { BookingPage } from './booking-page';
import { HoldingsPage } from './holdings-page';
import {
  annualized,
  installments,
  shortPercent,
  simulate,
  toPoisha,
  toTaka,
  typedTaka,
} from './project-math';
import { ProjectCard } from './project-card';
import { ProofFileLink } from './proof-file-link';
import {
  parsePaymentsSearch,
  parseProjectsSearch,
  parseRefundsSearch,
} from './projects-search';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const booking = (over: Partial<ReservationDto> = {}): ReservationDto => ({
  id: 61,
  projectId: 'p1',
  projectTitle: 'Agricultural Input 12',
  investor: { id: 'me', fullName: 'Demo Investor' },
  slots: 2,
  amount: '40000.00',
  status: 'pending',
  reservedAt: '2026-10-20T00:00:00.000Z',
  expiresAt: '2099-10-27T00:00:00.000Z',
  onHold: false,
  pausedRemainingSeconds: null,
  paid: '0.00',
  underReview: '0.00',
  remaining: '40000.00',
  ...over,
});

describe('project money', () => {
  it('counts in whole poisha, never in floating point', () => {
    expect(toPoisha('20000.05')).toBe(2_000_005n);
    expect(toPoisha('0.1')).toBe(10n);
    expect(toPoisha('ten taka')).toBe(0n);
    expect(toTaka(2_000_005n)).toBe('20000.05');
    expect(typedTaka('১,০০,০০০')).toBe('100000');
    expect(typedTaka('12.345')).toBeNull();
  });

  it('spreads the high estimate over a year, rounding down', () => {
    // 10.5% in 5 months is 25.2% a year, as in WeGro's app.
    expect(annualized(project())).toBe('25.2');
    expect(annualized(project({ durationMonths: 12 }))).toBe('10.5');
    expect(shortPercent('10.50')).toBe('10.5');
    expect(shortPercent('20.00')).toBe('20');
    expect(shortPercent('100.00')).toBe('100');
  });

  it('simulates units: cost, profit and value at the end', () => {
    expect(simulate(project(), 2)).toEqual({
      invest: '40000.00',
      profitMin: '3000.00',
      profitMax: '4200.00',
      valueMin: '43000.00',
      valueMax: '44200.00',
    });
    expect(installments(project())).toBe(1);
    expect(
      installments(project({ durationMonths: 12, payoutIntervalMonths: 4 })),
    ).toBe(3);
  });

  it('keeps only what the lists understand from the address', () => {
    expect(
      parseProjectsSearch({
        tab: 'saved',
        q: ' maize ',
        stage: 'nope',
        district: 'BOGURA',
      }),
    ).toEqual({ tab: 'saved', q: 'maize', district: 'BOGURA' });
    expect(parsePaymentsSearch({ tab: 'pending', page: '3' })).toEqual({
      page: 3,
    });
  });

  it('keep only what each page understands from the address', () => {
    expect(
      parseProjectsSearch({
        page: '2',
        stage: 'funded',
        produce: 'MAIZE',
        tab: 'all',
      }),
    ).toEqual({ page: 2, stage: 'funded', produce: 'MAIZE' });
    // Not a page, a code or a search: dropped.
    expect(
      parseProjectsSearch({
        page: '1.5',
        produce: 'maize; drop',
        q: 'x'.repeat(101),
        district: 'ATLANTIS',
      }),
    ).toEqual({});
    for (const tab of ['accepted', 'rejected', 'bookings'] as const)
      expect(parsePaymentsSearch({ tab, q: ' Rahim ' })).toEqual({
        tab,
        q: 'Rahim',
      });
    expect(parsePaymentsSearch({ q: '   ', page: '0' })).toEqual({});
    expect(parseRefundsSearch({ q: ' Shirin ', page: '4' })).toEqual({
      q: 'Shirin',
      page: 4,
    });
    expect(parseRefundsSearch({ q: 7, page: 'x' })).toEqual({});
  });
});

describe('project cards', () => {
  it('show the range, the term, the annualized rate and the funding', async () => {
    await signedInAs('investor');
    fakeServer(() => undefined);
    await renderPage(
      <ProjectCard project={project({ favourite: false })} staff={false} />,
      '/projects',
    );
    expect(screen.getByText('7.5–10.5%')).toBeTruthy();
    expect(screen.getByText('5 Months')).toBeTruthy();
    expect(screen.getByText(/Up to 25\.2% annualized/)).toBeTruthy();
    expect(screen.getByText('20.00% funded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Project' })).toBeTruthy();
  });

  it('save and unsave a project, and say when that fails', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await signedInAs('investor');
    let refuse = false;
    const sent = fakeServer(() =>
      refuse
        ? { status: 503, body: { statusCode: 503, code: 'X', message: 'Down' } }
        : { body: { data: null } },
    );
    await renderPage(
      <ProjectCard project={project({ favourite: false })} staff={false} />,
      '/projects',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save Project' }));
    cleanup();
    await renderPage(
      <ProjectCard project={project({ favourite: true })} staff={false} />,
      '/projects',
    );
    const unsave = screen.getByRole('button', { name: 'Remove from Saved' });
    expect(unsave.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(unsave);
    await vi.waitFor(() =>
      expect(sent.map((r) => r.method)).toEqual(['PUT', 'DELETE']),
    );
    expect(sent[0]!.url.pathname).toBe('/api/projects/p1/favourite');
    refuse = true;
    await userEvent.click(unsave);
    await vi.waitFor(() => expect(failed).toHaveBeenCalled());
    failed.mockRestore();
  });

  it('show no save button where saving does not apply', async () => {
    await signedInAs('admin');
    fakeServer(() => undefined);
    await renderPage(<ProjectCard project={project()} staff />, '/projects');
    expect(screen.queryByRole('button', { name: 'Save Project' })).toBeNull();
  });
});

describe('the booking page', () => {
  const server = (b: ReservationDto) =>
    fakeServer(({ method, url }) => {
      if (url.pathname === '/api/reservations/61') return { body: { data: b } };
      if (url.pathname === '/api/reservations/61/proofs') {
        return method === 'POST'
          ? { status: 201, body: { data: {} } }
          : { body: { data: [] } };
      }
      if (url.pathname === '/api/projects/p1')
        return { body: { data: project() } };
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
      if (url.pathname === '/api/bank-list/banks') {
        return { body: { data: [{ code: 200, name: 'SONALI BANK LTD.' }] } };
      }
      if (url.pathname === '/api/bank-list/banks/200/districts') {
        return { body: { data: [{ code: 610, name: 'BOGRA' }] } };
      }
      if (url.pathname === '/api/bank-list/banks/200/districts/610/branches') {
        return {
          body: {
            data: [
              { routingNumber: '200100405', name: 'BOGRA BAZAR' },
              { routingNumber: '200100434', name: 'BOGRA CANTONMENT' },
            ],
          },
        };
      }
      return undefined;
    });

  it('refuses files it cannot take, drops a file on asking, and keeps the proof with the reason when refused', async () => {
    const forms = recordForms();
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await signedInAs('investor');
    server(booking());
    const serve = globalThis.fetch;
    let refuse = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        if (req.method === 'POST' && refuse) {
          refuse = false;
          return Response.json(
            { statusCode: 409, code: 'RESERVATION_EXPIRED', message: 'x' },
            { status: 409 },
          );
        }
        return serve(input, init);
      }),
    );
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    await userEvent.click(
      await screen.findByRole('button', { name: /Upload Payment Proof/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cash' }));
    const files = within(dialog).getByLabelText('Payment Proof');
    await userEvent.upload(
      files,
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      { applyAccept: false },
    );
    expect(failed).toHaveBeenCalledWith(
      'Photos (JPEG, PNG, WebP) or PDFs, up to 10 MB each, at most 3.',
    );
    await userEvent.upload(files, [
      new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }),
      new File(['%PDF'], 'b.pdf', { type: 'application/pdf' }),
    ]);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove a.pdf' }),
    );
    expect(within(dialog).queryByText('a.pdf')).toBeNull();
    const day = dialog.querySelector('#proof-date') as HTMLInputElement;
    fireEvent.change(day, { target: { value: '2026-10-20' } });
    await userEvent.type(
      within(dialog).getByLabelText('Transaction or Cheque Number'),
      ' TRX 9 ',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Note'),
      ' Paid at branch ',
    );
    const send = within(dialog).getByRole('button', {
      name: /Submit for Review/,
    });
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(send);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(Object.fromEntries(forms.at(-1)!)).toMatchObject({
      transferredOn: '2026-10-20',
      reference: 'TRX 9',
      note: 'Paid at branch',
      files: 'b.pdf',
    });
    await userEvent.click(
      screen.getByRole('button', { name: /Upload Payment Proof/ }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    failed.mockRestore();
  });

  it('asks a deposit’s bank, then district, then branch, and sends its routing number', async () => {
    const forms = recordForms();
    await signedInAs('investor');
    const sent = server(booking());
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    await userEvent.click(
      await screen.findByRole('button', { name: /Upload Payment Proof/ }),
    );
    const dialog = await screen.findByRole('dialog');
    // A deposit, nothing chosen: each missing piece is named.
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    expect(within(dialog).getByText('Choose the bank.')).toBeTruthy();
    expect(within(dialog).getByText('Choose the branch.')).toBeTruthy();

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
    const routing = within(dialog).getByLabelText(
      'Routing Number',
    ) as HTMLInputElement;
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
      expect(sent.some((s) => s.method === 'POST')).toBe(true),
    );
    expect(Object.fromEntries(forms.at(-1)!)).toMatchObject({
      method: 'bank_deposit',
      routingNumber: '200100405',
    });
  });

  it('shows where to pay, and sends a proof of part of the amount', async () => {
    const forms = recordForms();
    await signedInAs('investor');
    const sent = server(booking());
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    expect(await screen.findByText('WEGRO TECHNOLOGIES LTD')).toBeTruthy();
    expect(screen.getByText(/Pay within/)).toBeTruthy();
    // Nothing sent yet: the investor may cancel.
    expect(
      screen.getByRole('button', { name: 'Cancel This Booking' }),
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: /Upload Payment Proof/ }),
    );
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Amount Transferred');
    await userEvent.clear(amount);
    await userEvent.type(amount, '50000');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    // Too much, no bank, no file.
    expect(
      within(dialog).getByText(
        /Enter an amount above zero and at most ৳\s?40,000/,
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText('Choose the bank.')).toBeTruthy();
    expect(within(dialog).getByText('Attach at least one file.')).toBeTruthy();

    await userEvent.clear(amount);
    await userEvent.type(amount, '15000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cash' }));
    const file = new File(['%PDF-1.4'], 'slip.pdf', {
      type: 'application/pdf',
    });
    await userEvent.upload(
      within(dialog).getByLabelText('Payment Proof'),
      file,
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.url.pathname).toBe(
        '/api/reservations/61/proofs',
      ),
    );
    expect(Object.fromEntries(forms.at(-1)!)).toMatchObject({
      amount: '15000',
      method: 'cash',
      files: 'slip.pdf',
    });
  });

  it('offers no cancel once money was sent, and says the clock is stopped', async () => {
    await signedInAs('investor');
    server(
      booking({
        onHold: true,
        pausedRemainingSeconds: 3 * 3600 + 15 * 60,
        underReview: '15000.00',
        remaining: '25000.00',
      }),
    );
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    expect(await screen.findByText('Payment Under Review')).toBeTruthy();
    expect(screen.getByText(/stopped with 3h 15m left/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Cancel This Booking' }),
    ).toBeNull();
  });
});

describe('the holdings page', () => {
  const holding = {
    project: project({ stage: 'active' }),
    slots: 3,
    invested: '60000.00',
    pendingSlots: 1,
    estimatedReturn: { minAmount: '4500.00', maxAmount: '6300.00' },
  };

  it('totals what is held, and lists holdings and bookings', async () => {
    await signedInAs('investor');
    fakeServer(({ url }) =>
      url.pathname === '/api/investments'
        ? {
            body: {
              data: [
                holding,
                {
                  ...holding,
                  project: project({ id: 'p2', title: 'Wheat 3' }),
                  invested: '20000.00',
                  pendingSlots: 0,
                },
              ],
            },
          }
        : {
            body: {
              data: [
                booking(),
                booking({ id: 62, onHold: true }),
                booking({ id: 63, status: 'confirmed' }),
              ],
              meta: { total: 3, page: 1, limit: 50, totalPages: 1 },
            },
          },
    );
    await renderPage(<HoldingsPage />, '/holdings');
    expect(await screen.findByText('Invested in all: ৳ 80,000')).toBeTruthy();
    expect(screen.getByText('1 more unit waiting for payment')).toBeTruthy();
    expect(screen.getByText('Wheat 3')).toBeTruthy();
    expect(
      screen
        .getByText(/Booking #61/)
        .closest('a')!
        .getAttribute('href'),
    ).toBe('/holdings/bookings/61');
    expect(screen.getAllByText(/৳ 40,000 left to pay/)).toHaveLength(2);
    expect(screen.getByText('Under Review')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
  });

  it('says when nothing is held or booked, and tries again after an error', async () => {
    await signedInAs('investor');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/investments'
        ? ++calls > 1
          ? { body: { data: [] } }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } }
        : {
            body: {
              data: [],
              meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
            },
          },
    );
    await renderPage(<HoldingsPage />, '/holdings');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('You hold no units yet')).toBeTruthy();
    expect(screen.getByText('No bookings yet.')).toBeTruthy();
  });
});

describe('a proof file link', () => {
  const file = {
    id: 'f1',
    url: '/api/payment-proofs/files/f1',
    mimeType: 'application/pdf',
    size: 3,
  };

  it('opens the file in the tab it opened first, or here when pop-ups are blocked', async () => {
    const revoke = vi.fn();
    await signedInAs('accounts');
    fakeServer(() => ({ body: {} }));
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:f1'),
        revokeObjectURL: revoke,
      }),
    );
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    await renderPage(
      <ProofFileLink file={file as never} index={0}>
        Statement
      </ProofFileLink>,
      '/payments',
    );
    const later = vi.spyOn(globalThis, 'setTimeout');
    await userEvent.click(screen.getByRole('button', { name: 'Statement' }));
    await vi.waitFor(() => expect(tab.location.href).toBe('blob:f1'));
    // The file's address is let go a minute later.
    const release = later.mock.calls.find(([, ms]) => ms === 60_000)!;
    (release[0] as () => void)();
    expect(revoke).toHaveBeenCalledWith('blob:f1');
    later.mockRestore();

    open.mockReturnValue(null);
    const assign = vi.fn();
    const { origin, href } = window.location;
    vi.stubGlobal('location', { assign, origin, href });
    await userEvent.click(screen.getByRole('button', { name: 'Statement' }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('blob:f1'));
    open.mockRestore();
  });

  it('closes the tab and says so when the file cannot be fetched', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await signedInAs('accounts');
    fakeServer(() => ({ status: 404, body: { code: 'NOT_FOUND' } }));
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    await renderPage(
      <ProofFileLink file={file as never} index={0}>
        Statement
      </ProofFileLink>,
      '/payments',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Statement' }));
    await vi.waitFor(() =>
      expect(failed).toHaveBeenCalledWith('The file could not be opened.'),
    );
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
    failed.mockRestore();
  });

  it('says only that it failed when the answer is not the server’s (a proxy’s page)', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await signedInAs('accounts');
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response('<html>Bad Gateway</html>', { status: 502 }),
      ),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(
      <ProofFileLink file={file as never} index={0}>
        Statement
      </ProofFileLink>,
      '/payments',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Statement' }));
    await vi.waitFor(() =>
      expect(failed).toHaveBeenCalledWith('The file could not be opened.'),
    );
    open.mockRestore();
    failed.mockRestore();
  });

  it('says why when the server refuses a file no longer as sent', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await signedInAs('accounts');
    fakeServer(() => ({
      status: 409,
      body: {
        statusCode: 409,
        code: 'PROOF_FILE_ALTERED',
        message: 'The file no longer matches the one that was sent',
      },
    }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(
      <ProofFileLink file={file as never} index={0}>
        Statement
      </ProofFileLink>,
      '/payments',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Statement' }));
    await vi.waitFor(() =>
      expect(failed).toHaveBeenCalledWith(
        'This file no longer matches the one that was sent, so it is not shown. The admins have been told.',
      ),
    );
    open.mockRestore();
    failed.mockRestore();
  });
});

describe('the booking page, further', () => {
  const sentProof = {
    id: 'proof-1',
    amount: '20000.00',
    status: 'rejected',
    method: 'cash',
    transferredOn: '2026-10-20',
    submittedAt: '2026-10-20T08:00:00Z',
    rejectionReason: 'Not on the statement',
    refund: 'due',
    files: [{ id: 'f1', url: '/api/payment-proofs/files/f1' }],
  };
  const serve = (
    b: ReservationDto | (() => Reply),
    over: { proofs?: unknown[]; cancel?: () => Reply } = {},
  ) =>
    fakeServer(({ method, url }) => {
      if (url.pathname === '/api/reservations/61')
        return typeof b === 'function' ? b() : { body: { data: b } };
      if (url.pathname === '/api/reservations/61/proofs')
        return { body: { data: over.proofs ?? [] } };
      if (url.pathname === '/api/reservations/61/cancel' && method === 'POST')
        return (
          over.cancel?.() ?? {
            body: { data: booking({ status: 'cancelled' }) },
          }
        );
      if (url.pathname === '/api/projects/p1')
        return { body: { data: project() } };
      if (url.pathname === '/api/payment-accounts')
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
              },
            ],
          },
        };
      return undefined;
    });

  it('says a paid booking is complete, and an ended one went back on sale', async () => {
    await signedInAs('investor');
    serve(
      booking({ status: 'confirmed', paid: '40000.00', remaining: '0.00' }),
    );
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    expect(await screen.findByText('Payment Complete')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Cancel This Booking' }),
    ).toBeNull();
    cleanup();
    await signedInAs('investor');
    serve(booking({ status: 'expired' }), { proofs: [sentProof] });
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    expect(await screen.findByText('Booking Expired')).toBeTruthy();
    // What was sent, what Accounts decided, and that it is refunded.
    expect(await screen.findByText('Your Payments')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('To be refunded by WeGro.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /File 1/ })).toBeTruthy();
  });

  it('copies the account details, or says it could not', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await signedInAs('investor');
    serve(booking());
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    const copy = (await screen.findAllByRole('button', { name: /^Copy / }))[0]!;
    await userEvent.click(copy);
    await vi.waitFor(() => expect(ok).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalled();
    writeText.mockRejectedValueOnce(new Error('denied'));
    await userEvent.click(copy);
    await vi.waitFor(() =>
      expect(failed).toHaveBeenCalledWith(
        'Could not copy. Select the text instead.',
      ),
    );
    ok.mockRestore();
    failed.mockRestore();
  });

  it('cancels a booking nothing was sent for, after asking, and keeps it when refused', async () => {
    let refuse = true;
    await signedInAs('investor');
    serve(booking(), {
      cancel: () =>
        refuse
          ? {
              status: 409,
              body: {
                statusCode: 409,
                code: 'BOOKING_HAS_PAYMENTS',
                message: 'Money was sent',
              },
            }
          : { body: { data: booking({ status: 'cancelled' }) } },
    });
    const { router } = await renderPage(
      <BookingPage id={61} />,
      '/holdings/bookings/61',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel This Booking' }),
    );
    let dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Your ৳ 40,000 booking is released at once'),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Keep My Units' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel This Booking' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel This Booking' }),
    );
    dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Yes, Cancel Booking' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Yes, Cancel Booking' }),
    );
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/holdings'),
    );
  });

  it('says what went wrong, and tries again', async () => {
    let calls = 0;
    await signedInAs('investor');
    serve(() =>
      ++calls > 1
        ? { body: { data: booking() } }
        : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    await renderPage(<BookingPage id={61} />, '/holdings/bookings/61');
    expect(await screen.findByRole('link', { name: /Holdings/ })).toBeTruthy();
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByRole('button', { name: 'Cancel This Booking' }),
    ).toBeTruthy();
  });
});
