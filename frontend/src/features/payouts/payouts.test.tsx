// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RoundDto,
  SettlementSummaryDto,
  StatementDto,
} from '@/api/generated/settlement';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { AddCostDialog } from './add-cost-dialog';
import { MyStatementPage } from './my-statement-page';
import { payoutTotal, periodQuery } from './payouts-utils';
import { ProjectSettlementPage } from './project-settlement-page';
import { RoundPage } from './round-page';
import { RoundsList } from './rounds-list';

beforeEach(() => {
  Object.assign(URL, {
    createObjectURL: () => 'blob:x',
    revokeObjectURL: () => undefined,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROJECT = '11111111-1111-4111-8111-111111111111';
const INVESTOR = '22222222-2222-4222-8222-222222222222';
const FARMER = '33333333-3333-4333-8333-333333333333';
const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages: 1 },
});

const eligibility = (over = {}) => ({
  allowed: false,
  reason: null,
  nextAllowedAt: null,
  outstanding: [],
  preview: null,
  ...over,
});

const summary = (
  over: Partial<SettlementSummaryDto> = {},
): SettlementSummaryDto => ({
  project: { id: PROJECT, name: 'Maize in Bogura' },
  stage: 'ready_for_sale',
  income: { total: '600000.00', sales: '600000.00', insurance: '0.00' },
  costs: { total: '200000.00', inputs: '150000.00', other: '50000.00' },
  net: '400000.00',
  distributedProfit: '0.00',
  openRoundId: null,
  settled: false,
  staged: eligibility({ reason: 'NOT_STAGED' }),
  final: eligibility({
    allowed: true,
    preview: {
      profit: '400000.00',
      farmerShare: '160000.00',
      investorShare: '160000.00',
      wegroShare: '80000.00',
      capitalReturn: '100000.00',
      leftover: '0.00',
      payees: 3,
    },
  }),
  rounds: [],
  ...over,
});

const round = (over: Partial<RoundDto> = {}): RoundDto => ({
  id: 7,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  isFinal: true,
  status: 'prepared',
  income: '600000.00',
  costs: '200000.00',
  profit: '400000.00',
  farmerShare: '160000.00',
  investorShare: '160000.00',
  wegroShare: '80000.00',
  capitalReturn: '100000.00',
  leftover: '0.00',
  fingerprint: '0x1',
  verified: true,
  preparedBy: { id: 'farhana', name: 'Farhana Accounts' },
  preparedAt: '2026-10-20T05:00:00.000Z',
  approvedBy: null,
  approvedAt: null,
  rejectReason: null,
  rejectedBy: null,
  rejectedAt: null,
  payeeCount: 2,
  paidCount: 0,
  paidAt: null,
  lines: [
    {
      payee: { id: INVESTOR, name: 'Nasrin Investor' },
      role: 'investor',
      slots: 10,
      amount: '260000.00',
      lineHash: '0x2',
      verified: true,
      paid: false,
      paidAt: null,
      paymentReference: null,
    },
    {
      payee: { id: FARMER, name: 'Rahim Farmer' },
      role: 'farmer',
      slots: null,
      amount: '160000.00',
      lineHash: '0x3',
      verified: true,
      paid: false,
      paidAt: null,
      paymentReference: null,
    },
  ],
  ...over,
});

/** jsdom's File and Node's FormData do not mix: record what the app appends. */
function recordForms(): Array<Array<[string, string]>> {
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
  return forms;
}

describe('payouts helpers', () => {
  it('adds what a round pays out exactly, and builds period queries', () => {
    expect(
      payoutTotal({
        farmerShare: '0.10',
        investorShare: '0.20',
        capitalReturn: '100000.05',
      }),
    ).toBe('100000.35');
    expect(periodQuery({})).toBe('');
    expect(periodQuery({ from: '2026-01-01', to: '2026-03-31' })).toBe(
      '?from=2026-01-01&to=2026-03-31',
    );
  });
});

describe('rounds', () => {
  it('starts Accounts on the rounds awaiting approval, searchable by number', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/settlement/rounds'
        ? { body: page([round()]) }
        : undefined,
    );
    await renderPage(<RoundsList search={{ q: '#7' }} />, '/payouts');
    expect(await screen.findByText(/Round #7 · Maize in Bogura/)).toBeTruthy();
    // What it pays: both shares and the capital returned.
    expect(screen.getByText('৳ 420,000')).toBeTruthy();
    const params = sent.find(
      (s) => s.url.pathname === '/api/settlement/rounds',
    )!.url.searchParams;
    expect(params.get('status')).toBe('prepared');
    expect(params.get('q')).toBe('#7');
  });

  it('lets a second Accounts person approve, never who prepared it', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/settlement/rounds/7')
        return { body: { data: round() } };
      if (
        method === 'POST' &&
        url.pathname === '/api/settlement/rounds/7/approve'
      )
        return { body: { data: round({ status: 'approved' }) } };
      return undefined;
    });
    await renderPage(<RoundPage id={7} />, '/payouts/rounds/7');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve Round' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Approve Round',
      }),
    );
    await waitFor(() =>
      expect(sent.some((s) => s.url.pathname.endsWith('/approve'))).toBe(true),
    );
    cleanup();

    await signedInAs('accounts');
    // The session user's id is "me": make them the preparer.
    fakeServer(({ url }) =>
      url.pathname === '/api/settlement/rounds/7'
        ? { body: { data: round({ preparedBy: { id: 'me', name: 'Me' } }) } }
        : undefined,
    );
    await renderPage(<RoundPage id={7} />, '/payouts/rounds/7');
    expect(await screen.findByText(/You prepared this round/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve Round' })).toBeNull();
  });

  it('records one line, or lists each problem of an uploaded sheet', async () => {
    const forms = recordForms();
    await signedInAs('accounts');
    const approved = round({ status: 'approved' });
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/settlement/rounds/7')
        return { body: { data: approved } };
      if (
        method === 'POST' &&
        url.pathname === '/api/settlement/rounds/7/payments'
      )
        return { body: { data: approved } };
      if (
        method === 'POST' &&
        url.pathname === '/api/settlement/rounds/7/payments/upload'
      )
        return {
          status: 422,
          body: {
            statusCode: 422,
            code: 'PAYMENT_SHEET_INVALID',
            message: 'problems',
            details: {
              problems: [
                { line: 3, problem: 'duplicate_reference' },
                { line: 4, problem: 'unknown_payee' },
              ],
            },
          },
        };
      return undefined;
    });
    await renderPage(<RoundPage id={7} />, '/payouts/rounds/7');
    const pay = await screen.findAllByRole('button', {
      name: 'Record Payment',
    });
    await userEvent.click(pay[0]!);
    let dialog = screen.getByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Payment Reference'),
      ' NPSB 1 ',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Payment' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname.endsWith('/payments'))?.body,
      ).toEqual({ payeeId: INVESTOR, paymentReference: 'NPSB 1' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(
      screen.getByRole('button', { name: /Upload Filled Sheet/ }),
    );
    dialog = screen.getByRole('dialog');
    const file = new File(['payee_id,payment_reference\n'], 'sheet.csv', {
      type: 'text/csv',
    });
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      file,
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Record Payments' }),
    );
    expect(
      await within(dialog).findByText(/Line 3: this reference is used twice/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Line 4: this payee is not in the round/),
    ).toBeTruthy();
    expect(forms.at(-1)).toEqual([['file', 'sheet.csv']]);
  });
});

describe('project settlement', () => {
  it('previews the final round for Accounts and prepares it', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === `/api/settlement/projects/${PROJECT}`)
        return { body: { data: summary() } };
      if (url.pathname === `/api/settlement/projects/${PROJECT}/costs`)
        return { body: { data: [] } };
      if (
        method === 'POST' &&
        url.pathname === `/api/settlement/projects/${PROJECT}/rounds`
      )
        return { status: 201, body: { data: round() } };
      return undefined;
    });
    await renderPage(
      <ProjectSettlementPage projectId={PROJECT} />,
      `/payouts/projects/${PROJECT}`,
    );
    expect(await screen.findByText('Capital Returned')).toBeTruthy();
    // A project paid only at the end has no staged round card.
    expect(screen.queryByText('Next Staged Round')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Prepare Final Round' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Prepare',
      }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({
        final: true,
      }),
    );
  });

  it('says what the final round waits for', async () => {
    await signedInAs('auditor');
    fakeServer(({ url }) => {
      if (url.pathname === `/api/settlement/projects/${PROJECT}`)
        return {
          body: {
            data: summary({
              final: eligibility({
                reason: 'STILL_OUTSTANDING',
                outstanding: ['TRADES', 'CLAIMS'],
              }),
            }),
          },
        };
      if (url.pathname === `/api/settlement/projects/${PROJECT}/costs`)
        return { body: { data: [] } };
      return undefined;
    });
    await renderPage(
      <ProjectSettlementPage projectId={PROJECT} />,
      `/payouts/projects/${PROJECT}`,
    );
    expect(
      await screen.findByText(
        'Waiting for: marketplace deals not yet finished, insurance claims not yet decided or paid.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Prepare/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Cost/ })).toBeNull();
  });

  it('refuses a cost without its bill', async () => {
    const forms = recordForms();
    await signedInAs('accounts');
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST' && url.pathname === '/api/photos')
        return {
          status: 201,
          body: {
            data: {
              id: 'bill-1',
              mimeType: 'image/jpeg',
              sizeBytes: 10,
              photoHash: '0x',
            },
          },
        };
      if (
        method === 'POST' &&
        url.pathname === `/api/settlement/projects/${PROJECT}/costs`
      )
        return { status: 201, body: { data: {} } };
      return undefined;
    });
    await renderPage(
      <AddCostDialog projectId={PROJECT} onClose={() => undefined} />,
      '/payouts/costs',
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Transport' }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Amount (Taka)'),
      '১৫০০',
    );
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Truck hire');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Cost' }),
    );
    expect(within(dialog).getByText('Add a photo of the bill.')).toBeTruthy();
    expect(sent.some((s) => s.url.pathname.endsWith('/costs'))).toBe(false);

    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpeg'], 'bill.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() =>
      expect(sent.some((s) => s.url.pathname === '/api/photos')).toBe(true),
    );
    expect(forms.at(-1)).toEqual([['file', 'bill.jpg']]);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Cost' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname.endsWith('/costs'))?.body,
      ).toMatchObject({
        category: 'transport',
        amount: '1500',
        note: 'Truck hire',
        photoId: 'bill-1',
      }),
    );
  });
});

describe('statement', () => {
  it('shows an investor what they put in, received and are due', async () => {
    await signedInAs('investor');
    const statement: StatementDto = {
      payee: { id: 'me', name: 'Nasrin Investor' },
      from: null,
      to: null,
      projects: [
        {
          project: { id: PROJECT, name: 'Maize in Bogura' },
          stage: 'paid_out',
          role: 'investor',
          slots: 10,
          invested: '100000.00',
          payouts: [
            {
              roundId: 7,
              isFinal: true,
              approvedAt: '2026-10-21T05:00:00.000Z',
              amount: '260000.00',
              paid: true,
              paidAt: '2026-10-22T05:00:00.000Z',
              lineHash: '0x2',
              verified: true,
            },
          ],
          received: '260000.00',
          due: '0.00',
          refunded: '0.00',
        },
      ],
      totals: {
        invested: '100000.00',
        received: '260000.00',
        due: '0.00',
        refunded: '0.00',
      },
      note: 'Each line is checked against the ledger.',
    };
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/me/statement'
        ? { body: { data: statement } }
        : undefined,
    );
    await renderPage(<MyStatementPage />, '/statement');
    expect(await screen.findByText('Maize in Bogura')).toBeTruthy();
    expect(screen.getAllByText('৳ 260,000').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /Statement \(CSV\)/ }),
    ).toBeTruthy();
    await userEvent.type(screen.getByLabelText('From'), '2026-01-01');
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.url.pathname === '/api/me/statement' &&
            s.url.searchParams.get('from') === '2026-01-01',
        ),
      ).toBe(true),
    );
  });
});
