// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CostDto,
  RoundDto,
  SettlementSummaryDto,
} from '@/api/generated/settlement';
import type { ProjectDto } from '@/api/generated/projects';
import type { Role } from '@/app/navigation';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { CostsList } from './costs-list';
import { ProjectPayouts } from './project-payouts';
import { ProjectSettlementPage } from './project-settlement-page';
import { ReportsPage } from './reports-page';
import { RoundPage } from './round-page';
import { RoundsList } from './rounds-list';
import { SettleProjectsList } from './settle-projects-list';

const clicks = vi.fn();
beforeEach(() => {
  Object.assign(URL, {
    createObjectURL: () => 'blob:x',
    revokeObjectURL: () => undefined,
  });
  clicks.mockClear();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROJECT = '11111111-1111-4111-8111-111111111111';
const page = <T,>(data: T[], totalPages = 1) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages },
});
const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});
const posted = (sent: Sent[], path: string) =>
  sent.filter((s) => s.method === 'POST' && s.url.pathname === path);

const round = (over: Partial<RoundDto> = {}): RoundDto => ({
  id: 7,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  isFinal: false,
  status: 'prepared',
  income: '600000.00',
  costs: '200000.00',
  profit: '400000.00',
  farmerShare: '160000.00',
  investorShare: '160000.00',
  wegroShare: '80000.00',
  capitalReturn: '0.00',
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
  payeeCount: 3,
  paidCount: 1,
  paidAt: null,
  lines: [
    {
      payee: { id: 'inv', name: 'Nasrin Investor' },
      role: 'investor',
      slots: 10,
      amount: '160000.00',
      lineHash: '0x2',
      verified: true,
      paid: false,
      paidAt: null,
      paymentReference: null,
    },
    {
      payee: { id: 'far', name: 'Rahim Farmer' },
      role: 'farmer',
      slots: null,
      amount: '160000.00',
      lineHash: '0x3',
      verified: true,
      paid: true,
      paidAt: '2026-10-22T05:00:00.000Z',
      paymentReference: 'bKash 99',
    },
    {
      payee: { id: 'odd', name: 'Odd Line' },
      role: null,
      slots: null,
      amount: null,
      lineHash: '0x4',
      verified: false,
      paid: false,
      paidAt: null,
      paymentReference: null,
    },
  ],
  ...over,
});

const eligibility = (over = {}) => ({
  allowed: false,
  reason: null,
  nextAllowedAt: null,
  outstanding: [],
  preview: null,
  ...over,
});
const preview = (over = {}) => ({
  profit: '100000.00',
  farmerShare: '40000.00',
  investorShare: '40000.00',
  wegroShare: '20000.00',
  capitalReturn: '0.00',
  leftover: '0.01',
  payees: 3,
  ...over,
});
const summary = (
  over: Partial<SettlementSummaryDto> = {},
): SettlementSummaryDto => ({
  project: { id: PROJECT, name: 'Maize in Bogura' },
  stage: 'active',
  income: { total: '600000.00', sales: '600000.00', insurance: '0.00' },
  costs: { total: '200000.00', inputs: '150000.00', other: '50000.00' },
  net: '400000.00',
  distributedProfit: '0.00',
  openRoundId: null,
  settled: false,
  staged: eligibility({ allowed: true, preview: preview() }),
  final: eligibility({ reason: 'ROUND_WRONG_STAGE' }),
  rounds: [],
  ...over,
});

const cost = (over: Partial<CostDto> = {}): CostDto => ({
  id: 'c1',
  projectId: PROJECT,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  category: 'transport',
  amount: '1500.00',
  incurredOn: '2026-10-10',
  note: 'Truck hire',
  photoUrl: '/api/photos/b1/file',
  status: 'recorded',
  enteredBy: { id: 'farhana', name: 'Farhana Accounts' },
  detailsHash: '0x',
  ...over,
});

async function show(
  role: Role,
  ui: React.ReactNode,
  path: string,
  answer: (s: Sent) => Reply | undefined,
) {
  await signedInAs(role);
  const sent = fakeServer(answer);
  const view = await renderPage(ui, path);
  return { sent, ...view };
}

describe('the rounds list', () => {
  it('moves between views, searches and pages', async () => {
    const { router, sent } = await show(
      'accounts',
      <RoundsList search={{}} />,
      '/payouts',
      () => ({ body: page([round()], 2) }),
    );
    expect(await screen.findByText(/1 of 3 payees paid/)).toBeTruthy();
    expect(screen.getByText('Staged')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('status')).toBe('prepared');
    await userEvent.click(screen.getByRole('tab', { name: 'To Pay' }));
    expect(router.state.location.search).toEqual({ tab: 'approved' });
    await userEvent.click(
      screen.getByRole('tab', { name: 'Awaiting Approval' }),
    );
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'maize');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'maize' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('shows everyone else all rounds first, says when none match, and tries again', async () => {
    const { sent } = await show(
      'auditor',
      <RoundsList search={{}} />,
      '/payouts',
      () => ({ body: page([]) }),
    );
    expect(await screen.findByText('No payout rounds here.')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('status')).toBeNull();
    cleanup();
    let calls = 0;
    await show(
      'auditor',
      <RoundsList search={{ q: '#9' }} />,
      '/payouts',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No rounds match.')).toBeTruthy();
  });
});

describe('a round', () => {
  const at = (
    r: RoundDto,
    write?: (s: Sent) => Reply,
    role: Role = 'accounts',
  ) =>
    show(role, <RoundPage id={7} />, '/payouts/rounds/7', (s) =>
      s.method === 'POST'
        ? (write?.(s) ?? { body: { data: r } })
        : s.url.pathname === '/api/settlement/rounds/7'
          ? { body: { data: r } }
          : s.url.pathname.endsWith('/payout-sheet.csv')
            ? {
                body: 'payee_id,payment_reference\n',
              }
            : undefined,
    );

  it('shows each line as it stands', async () => {
    await at(round(), undefined, 'auditor');
    expect(await screen.findByText('Nasrin Investor')).toBeTruthy();
    expect(screen.getByText('Not Paid')).toBeTruthy();
    expect(screen.getByText(/bKash 99/)).toBeTruthy();
    expect(screen.getByText('Does Not Match the Ledger')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    // Nothing for the auditor to do.
    expect(screen.queryByRole('button', { name: 'Approve Round' })).toBeNull();
  });

  it('is sent back with a reason, once the server takes it', async () => {
    let refuse = true;
    const { sent } = await at(round(), (s) =>
      s.url.pathname.endsWith('/reject') && refuse
        ? failure(409, 'ROUND_NOT_PREPARED')
        : { body: { data: round({ status: 'rejected' }) } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Send Back' }),
    );
    const dialog = screen.getByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'Send Back' });
    await userEvent.click(send);
    expect(within(dialog).getByText('Say what needs correcting.')).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Reason'),
      ' Wrong costs ',
    );
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      posted(sent, '/api/settlement/rounds/7/reject').at(-1)!.body,
    ).toEqual({ reason: 'Wrong costs' });
    await userEvent.click(screen.getByRole('button', { name: 'Send Back' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send Back' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the approval with the reason when refused, and never approves figures off the ledger', async () => {
    await at(round(), () => failure(409, 'ROUND_NOT_PREPARED'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve Round' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/to 3 payees/)).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Approve Round' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    cleanup();

    await at(round({ verified: false }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve Round' }),
    );
    const off = screen.getByRole('dialog');
    expect(
      within(off).getByText(
        'Some figures here do not match the ledger. Do not approve; report it.',
      ),
    ).toBeTruthy();
    expect(
      within(off)
        .getByRole('button', { name: 'Approve Round' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('records a payment only with its reference, and gives the payout sheet', async () => {
    let refuse = true;
    await at(round({ status: 'approved' }), (s) =>
      s.url.pathname.endsWith('/payments') && refuse
        ? failure(409, 'PAYMENT_REF_ALREADY_USED')
        : { body: { data: round({ status: 'approved' }) } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Record Payment' }),
    );
    const dialog = screen.getByRole('dialog');
    const record = within(dialog).getByRole('button', {
      name: 'Record Payment',
    });
    await userEvent.click(record);
    expect(
      within(dialog).getByRole('textbox').getAttribute('aria-invalid'),
    ).toBe('true');
    await userEvent.type(within(dialog).getByRole('textbox'), 'NPSB 7');
    await userEvent.click(record);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(record);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(
      screen.getByRole('button', { name: 'Record Payment' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(
      screen.getByRole('button', { name: /Payout Sheet \(CSV\)/ }),
    );
    await waitFor(() =>
      expect(clicks).toHaveBeenCalledWith('payout-sheet.csv'),
    );
  });

  it('uploads the filled sheet, saying what it recorded', async () => {
    const forms = recordForms();
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const { sent } = await at(round({ status: 'approved' }), () => ({
      body: { data: { recorded: 2, blank: 1 } },
    }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Upload Filled Sheet/ }),
    );
    const dialog = screen.getByRole('dialog');
    const send = within(dialog).getByRole('button', {
      name: 'Record Payments',
    });
    // No file chosen yet: nothing to send.
    expect(send.hasAttribute('disabled')).toBe(true);
    const picker = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Choose the CSV file/ }),
    );
    expect(picker).toHaveBeenCalled();
    picker.mockRestore();
    expect(
      posted(sent, '/api/settlement/rounds/7/payments/upload'),
    ).toHaveLength(0);
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['x'], 'sheet.csv', { type: 'text/csv' }),
    );
    expect(within(dialog).getByText('sheet.csv')).toBeTruthy();
    await userEvent.click(send);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        '2 payments recorded; 1 left without a reference.',
      ),
    );
    expect(forms.at(-1)).toEqual([['file', 'sheet.csv']]);
    await userEvent.click(
      screen.getByRole('button', { name: /Upload Filled Sheet/ }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says when the sheet cannot be downloaded', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await show('accounts', <RoundPage id={7} />, '/payouts/rounds/7', (s) =>
      s.url.pathname === '/api/settlement/rounds/7'
        ? {
            body: {
              data: round({ status: 'paid', paidAt: '2026-10-25T00:00:00Z' }),
            },
          }
        : undefined,
    );
    expect(await screen.findByText('Every line is paid.')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /Payout Sheet \(CSV\)/ }),
    );
    await waitFor(() =>
      expect(failed).toHaveBeenCalledWith(
        'The file could not be downloaded. Try again.',
      ),
    );
  });

  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await show('accounts', <RoundPage id={7} />, '/payouts/rounds/7', (s) =>
      s.url.pathname === '/api/settlement/rounds/7'
        ? ++calls > 1
          ? { body: { data: round({ status: 'rejected', rejectReason: 'x' }) } }
          : failure(500, 'X')
        : undefined,
    );
    expect(
      (await screen.findByRole('link', { name: /Payout Rounds/ })).getAttribute(
        'href',
      ),
    ).toBe('/payouts');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(await screen.findByText('Sent Back')).toBeTruthy();
    // Nothing more to do with a round sent back.
    expect(screen.queryByRole('button', { name: /Payout Sheet/ })).toBeNull();
  });
});

describe('the costs list', () => {
  const answer =
    (rows: CostDto[], totalPages = 1, write?: (s: Sent) => Reply) =>
    (s: Sent): Reply | undefined => {
      if (s.method === 'POST') return write?.(s) ?? { body: { data: {} } };
      if (s.url.pathname === '/api/settlement/costs')
        return { body: page(rows, totalPages) };
      if (s.url.pathname === '/api/photos/b1/file') return { body: 'jpg' };
      if (s.url.pathname === '/api/projects')
        return { body: page([project({ id: PROJECT })]) };
      return undefined;
    };

  it('moves between categories, searches and pages, with each bill', async () => {
    const { router } = await show(
      'admin',
      <CostsList search={{}} />,
      '/payouts/costs',
      answer(
        [
          cost(),
          cost({
            id: 'c2',
            status: 'voided',
            voidedBy: { id: 'a', name: 'Ayesha' },
            photoUrl: null,
          }),
        ],
        2,
      ),
    );
    expect(await screen.findByText('Voided by Ayesha')).toBeTruthy();
    expect(await screen.findByRole('img', { name: 'Bill photo' })).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: 'Maize in Bogura' })[0]!
        .getAttribute('href'),
    ).toBe(`/payouts/projects/${PROJECT}`);
    // Only Accounts void or add.
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Cost/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Labour' }));
    expect(router.state.location.search).toEqual({ tab: 'labour' });
    await userEvent.click(screen.getByRole('tab', { name: 'Voided' }));
    expect(router.state.location.search).toEqual({ tab: 'voided' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'truck');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'truck' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('asks for the category or the voided costs of the tab shown', async () => {
    const listed = (sent: Sent[]) =>
      sent.find((s) => s.url.pathname === '/api/settlement/costs')!.url
        .searchParams;
    let view = await show(
      'admin',
      <CostsList search={{ tab: 'labour' }} />,
      '/payouts/costs',
      answer([]),
    );
    await screen.findByText('No costs here.');
    expect(listed(view.sent).get('category')).toBe('labour');
    cleanup();
    view = await show(
      'admin',
      <CostsList search={{ tab: 'voided' }} />,
      '/payouts/costs',
      answer([]),
    );
    await screen.findByText('No costs here.');
    expect(listed(view.sent).get('voidedOnly')).toBe('true');
    expect(listed(view.sent).get('category')).toBeNull();
  });

  it('lets Accounts void a cost, keeping the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await show(
      'accounts',
      <CostsList search={{}} />,
      '/payouts/costs',
      answer([cost()], 1, () =>
        refuse ? failure(409, 'COST_NOT_RECORDED') : { body: { data: {} } },
      ),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Void' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Transport of ৳ 1,500 stops counting. Enter it again if it was only wrong.',
      ),
    ).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Void' });
    await userEvent.click(confirm);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posted(sent, '/api/settlement/costs/c1/void')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Void' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('adds a cost to a project chosen from those open', async () => {
    await show(
      'accounts',
      <CostsList search={{}} />,
      '/payouts/costs',
      answer([]),
    );
    expect(await screen.findByText('No costs here.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Add Cost/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Cost' }),
    );
    expect(within(dialog).getByText('Say what the cost was for.')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Project' }),
    );
    expect(
      (await screen.findAllByRole('option', { name: /Rahim Uddin/ })).length,
    ).toBeGreaterThan(0);
    await userEvent.keyboard('{Escape}');
    const day = within(dialog).getByLabelText('Day of the Cost');
    await userEvent.clear(day);
    await userEvent.type(day, '2099-01-01');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Cost' }),
    );
    expect(
      within(dialog).getByText('Choose today or an earlier day.'),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Add Cost/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps a cost with the reason when the server refuses it', async () => {
    recordForms();
    await show(
      'accounts',
      <ProjectSettlementPage projectId={PROJECT} />,
      `/payouts/projects/${PROJECT}`,
      (s) => {
        if (s.method === 'POST' && s.url.pathname === '/api/photos')
          return {
            status: 201,
            body: { data: { id: 'b1', mimeType: 'image/jpeg' } },
          };
        if (s.method === 'POST') return failure(409, 'PROJECT_STAGE_INVALID');
        if (s.url.pathname === `/api/settlement/projects/${PROJECT}`)
          return { body: { data: summary() } };
        if (s.url.pathname === `/api/settlement/projects/${PROJECT}/costs`)
          return { body: { data: [] } };
        return undefined;
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Add Cost/ }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Labour' }),
    );
    await userEvent.type(within(dialog).getByLabelText('Amount (Taka)'), '900');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Weeding');
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpg'], 'bill.jpg', { type: 'image/jpeg' }),
    );
    const add = within(dialog).getByRole('button', { name: 'Add Cost' });
    await waitFor(() => expect(add.hasAttribute('disabled')).toBe(false));
    await userEvent.click(add);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
  });

  it('says when nothing matches, and tries again after an error', async () => {
    let calls = 0;
    await show(
      'accounts',
      <CostsList search={{ q: 'zzz' }} />,
      '/payouts/costs',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No costs match.')).toBeTruthy();
  });
});

describe('the projects to settle', () => {
  it('moves between stages, searches and pages', async () => {
    const { router, sent } = await show(
      'accounts',
      <SettleProjectsList search={{}} />,
      '/payouts/projects',
      () => ({ body: page([project({ id: PROJECT })], 2) }),
    );
    expect(
      (await screen.findByRole('link', { name: project().title })).getAttribute(
        'href',
      ),
    ).toBe(`/payouts/projects/${PROJECT}`);
    expect(sent[0]!.url.searchParams.get('stage')).toBe('ready_for_sale');
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(router.state.location.search).toEqual({ tab: 'active' });
    await userEvent.click(screen.getByRole('tab', { name: 'Ready for Sale' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'bogura');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'bogura' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('says when there are none, and tries again after an error', async () => {
    await show(
      'accounts',
      <SettleProjectsList search={{ tab: 'paid_out' }} />,
      '/payouts/projects',
      () => ({ body: page([]) }),
    );
    expect(await screen.findByText('No projects here.')).toBeTruthy();
    cleanup();
    let calls = 0;
    await show(
      'accounts',
      <SettleProjectsList search={{ q: 'zzz' }} />,
      '/payouts/projects',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No projects match.')).toBeTruthy();
  });
});

describe('a project’s settlement', () => {
  const at = (
    s: SettlementSummaryDto | (() => Reply),
    costs: CostDto[] = [],
    write?: (sent: Sent) => Reply,
  ) =>
    show(
      'accounts',
      <ProjectSettlementPage projectId={PROJECT} />,
      `/payouts/projects/${PROJECT}`,
      (r) => {
        if (r.method === 'POST')
          return write?.(r) ?? { status: 201, body: { data: round() } };
        if (r.url.pathname === `/api/settlement/projects/${PROJECT}`)
          return typeof s === 'function' ? s() : { body: { data: s } };
        if (r.url.pathname === `/api/settlement/projects/${PROJECT}/costs`)
          return { body: { data: costs } };
        return undefined;
      },
    );

  it('prepares a staged round, keeping the dialog when refused', async () => {
    let refuse = true;
    const { router } = await at(summary(), [cost()], () =>
      refuse
        ? failure(409, 'NOTHING_TO_DISTRIBUTE')
        : { status: 201, body: { data: round({ id: 9 }) } },
    );
    expect(await screen.findByText('Next Staged Round')).toBeTruthy();
    expect(screen.getByText('Left Over (Rounding)')).toBeTruthy();
    expect(await screen.findByText('Truck hire')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Prepare Staged Round' }),
    );
    const dialog = screen.getByRole('dialog');
    const prepare = within(dialog).getByRole('button', { name: 'Prepare' });
    await userEvent.click(prepare);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    refuse = false;
    await userEvent.click(
      screen.getByRole('button', { name: 'Prepare Staged Round' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Prepare',
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/payouts/rounds/9'),
    );
  });

  it('says when the next staged round is due, and lists past rounds', async () => {
    await at(
      summary({
        staged: eligibility({
          reason: 'TOO_EARLY',
          nextAllowedAt: '2026-12-01T00:00:00Z',
        }),
        rounds: [
          {
            id: 4,
            isFinal: false,
            status: 'paid',
            profit: '50000.00',
            capitalReturn: '0.00',
            preparedAt: '2026-09-01T00:00:00Z',
          },
        ],
      } as never),
    );
    expect(
      await screen.findByText(/The next staged payout is due from/),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Round #4/ }).getAttribute('href'),
    ).toBe('/payouts/rounds/4');
    cleanup();

    await at(
      summary({
        staged: eligibility({ reason: 'TOO_EARLY' }),
      }),
    );
    expect(
      await screen.findByText('The next staged payout is due from —.'),
    ).toBeTruthy();
    cleanup();

    // Not allowed, for no stated reason: the card says nothing more.
    await at(summary({ staged: eligibility() }));
    expect(await screen.findByText('Next Staged Round')).toBeTruthy();
    expect(screen.queryByText(/Can be prepared now/)).toBeNull();
    cleanup();

    await at(
      summary({ staged: eligibility({ reason: 'NOTHING_TO_DISTRIBUTE' }) }),
    );
    expect(
      await screen.findByText('There is no new profit to split.'),
    ).toBeTruthy();
  });

  it('shows a settled project without rounds to prepare or costs to add', async () => {
    await at(
      summary({
        stage: 'paid_out',
        settled: true,
        final: eligibility({ reason: 'ALREADY_SETTLED' }),
      }),
    );
    expect(await screen.findByText('This project is settled.')).toBeTruthy();
    expect(screen.queryByText('Next Staged Round')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Cost/ })).toBeNull();
    expect(await screen.findByText('No costs entered yet.')).toBeTruthy();
  });

  it('freezes costs while the final round is open, and adds them otherwise', async () => {
    await at(
      summary({
        openRoundId: 8,
        final: eligibility({ reason: 'ROUND_OPEN' }),
        staged: eligibility({ reason: 'ROUND_OPEN' }),
      }),
    );
    expect(
      (await screen.findAllByText('A round of this project is still open.'))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Add Cost/ })).toBeNull();
    cleanup();

    await at(summary());
    await userEvent.click(
      await screen.findByRole('button', { name: /Add Cost/ }),
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await at(() =>
      ++calls > 1 ? { body: { data: summary() } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Next Staged Round')).toBeTruthy();
  });
});

describe('reports', () => {
  it('downloads the rounds of a period once both days are chosen', async () => {
    await show('accounts', <ReportsPage />, '/payouts/reports', (s) =>
      s.url.pathname === '/api/settlement/reports/period.csv'
        ? { body: 'x' }
        : undefined,
    );
    expect(screen.getAllByText('Choose both days.').length).toBeGreaterThan(0);
    const [from] = screen.getAllByLabelText('From');
    const [to] = screen.getAllByLabelText('To');
    await userEvent.type(from!, '2026-01-01');
    await userEvent.type(to!, '2026-03-31');
    await userEvent.click(
      await screen.findByRole('button', { name: /Download/ }),
    );
    await waitFor(() => expect(clicks).toHaveBeenCalledWith('period.csv'));
  });

  it('finds a farmer or an investor for their statement', async () => {
    const { sent } = await show(
      'accounts',
      <ReportsPage />,
      '/payouts/reports',
      (s) =>
        s.url.pathname === '/api/participants'
          ? {
              body: page([
                {
                  id: 'f1',
                  fullName: 'Rahim Farmer',
                  district: 'BOGURA',
                  role: 'farmer',
                },
              ]),
            }
          : s.url.pathname === '/api/settlement/statements/f1'
            ? failure(500, 'X')
            : undefined,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Farmer' }));
    expect(
      screen
        .getByRole('button', { name: 'Farmer' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.url.pathname === '/api/participants' &&
            s.url.searchParams.get('role') === 'farmer',
        ),
      ).toBe(true),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Rahim Farmer/ }),
    );
    // The statement could not be loaded: it says so, and asks again.
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    await waitFor(() =>
      expect(
        sent.filter((s) => s.url.pathname === '/api/settlement/statements/f1'),
      ).toHaveLength(2),
    );
  });
});

describe('a project’s payouts at a glance', () => {
  const card = (role: Role, stage: ProjectDto['stage'], s = summary()) =>
    show(
      role,
      <ProjectPayouts project={project({ id: PROJECT, stage })} />,
      `/projects/${PROJECT}`,
      (r) =>
        r.url.pathname === `/api/settlement/projects/${PROJECT}`
          ? { body: { data: s } }
          : undefined,
    );

  it('shows those with payouts the net so far, or that it is settled', async () => {
    await card('accounts', 'active');
    expect(
      await screen.findByText(
        'Net so far ৳ 400,000; ৳ 0 of profit already paid out.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'View Settlement' })
        .getAttribute('href'),
    ).toBe(`/payouts/projects/${PROJECT}`);
    cleanup();
    await card('admin', 'paid_out', summary({ settled: true }));
    expect(await screen.findByText('Settled')).toBeTruthy();
  });

  it('shows nothing before funding, or to those without payouts', async () => {
    const { sent } = await card('accounts', 'open_for_funding');
    const other = await card('investor', 'active');
    await new Promise((r) => setTimeout(r, 50));
    expect([...sent, ...other.sent]).toEqual([]);
    expect(screen.queryByText('View Settlement')).toBeNull();
  });
});
