// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDto, ReservationDto } from '@/api/generated/projects';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { BookingPage } from './booking-page';
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
import { parsePaymentsSearch, parseProjectsSearch } from './projects-search';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const project = (over: Partial<ProjectDto> = {}): ProjectDto => ({
  id: 'p1',
  title: 'Agricultural Input 12',
  description: null,
  produce: { code: 'MAIZE', name: 'Maize', nameBn: 'ভুট্টা', unit: 'kg' },
  category: 'storable_crop',
  district: { code: 'BOGURA', name: 'Bogura' },
  location: 'Shibganj',
  farmer: { id: 'f1', fullName: 'Rahim Uddin' },
  durationType: 'short_term',
  durationMonths: 5,
  payoutIntervalMonths: 0,
  fundingTarget: '100000.00',
  slotPrice: '20000.00',
  totalSlots: 5,
  issuedSlots: 1,
  reservedSlots: 1,
  availableSlots: 3,
  fundedPercent: '20.00',
  split: { farmer: '40.00', investors: '40.00', wegro: '20.00' },
  insured: false,
  estimatedReturn: {
    minPercent: '7.50',
    maxPercent: '10.50',
    minAmount: '1500.00',
    maxAmount: '2100.00',
    note: 'Estimate only.',
  },
  coverPhotoUrl: null,
  investorCount: 1,
  investingToday: 2,
  stage: 'open_for_funding',
  chainState: 'confirmed',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
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

  it('asks a deposit’s bank, then district, then branch, and sends its routing number', async () => {
    const forms: Array<Array<[string, string]>> = [];
    vi.stubGlobal(
      'FormData',
      class {
        entries: Array<[string, string]> = [];
        constructor() {
          forms.push(this.entries);
        }
        append(key: string, value: string | File) {
          this.entries.push([
            key,
            typeof value === 'string' ? value : value.name,
          ]);
        }
      },
    );
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
    // jsdom's File and Node's FormData do not mix: record what the app appends.
    const forms: Array<Array<[string, string]>> = [];
    vi.stubGlobal(
      'FormData',
      class {
        entries: Array<[string, string]> = [];
        constructor() {
          forms.push(this.entries);
        }
        append(key: string, value: string | File) {
          this.entries.push([
            key,
            typeof value === 'string' ? value : value.name,
          ]);
        }
      },
    );
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
