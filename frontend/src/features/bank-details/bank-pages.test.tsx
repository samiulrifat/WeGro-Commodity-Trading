// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BankAccountDto,
  BankAccountsDto,
  PendingBankAccountDto,
} from '@/api/generated/bank-accounts';
import type { Role } from '@/app/navigation';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { PersonBankAccountCard } from './bank-account-card';
import { BankListCard } from './bank-list-card';
import { BankQueue } from './bank-queue';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const page = <T,>(data: T[], totalPages = 1) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages },
});
const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});
const writes = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');

const account = (over: Partial<BankAccountDto> = {}): BankAccountDto => ({
  id: 'b1',
  holderName: 'Rahima Begum',
  bankName: 'SONALI BANK LTD.',
  branchName: 'BOGRA BAZAR',
  districtName: 'BOGRA',
  accountNumber: '0123456789',
  routingNumber: '200100405',
  status: 'pending',
  enteredBy: { id: 'admin2', name: 'Admin Ayesha' },
  enteredAt: '2026-10-20T04:00:00Z',
  decidedBy: null,
  decidedAt: null,
  rejectionReason: null,
  ...over,
});
const waiting = (over: Partial<PendingBankAccountDto> = {}) =>
  ({
    ...account(),
    owner: { id: 'u1', name: 'Rahima Begum' },
    ownerRole: 'farmer',
    isChange: false,
    ...over,
  }) as PendingBankAccountDto;

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

const listStatus = (over = {}): Reply => ({
  body: {
    data: {
      bankCount: 61,
      districtCount: 64,
      branchCount: 10500,
      importedAt: '2026-10-01T00:00:00Z',
      importedBy: null,
      ...over,
    },
  },
});

describe('bank details waiting', () => {
  const queue = (
    rows: PendingBankAccountDto[],
    write?: (s: Sent) => Reply,
    search = {},
    totalPages = 1,
  ) =>
    show(
      'admin',
      <BankQueue search={search} />,
      '/people/bank-details',
      (s) => {
        if (s.method !== 'GET') return write?.(s) ?? { body: { data: {} } };
        if (s.url.pathname === '/api/bank-accounts/pending')
          return { body: page(rows, totalPages) };
        if (s.url.pathname === '/api/bank-list') return listStatus();
        return undefined;
      },
    );

  it('lists each payee with what changes, searched and paged', async () => {
    const { router } = await queue(
      [waiting(), waiting({ id: 'b2', isChange: true, districtName: null })],
      undefined,
      {},
      2,
    );
    expect(
      (
        await screen.findAllByRole('link', { name: /Rahima Begum/ })
      )[0]!.getAttribute('href'),
    ).toBe('/people/u1');
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Change').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BOGRA BAZAR, BOGRA').length).toBeGreaterThan(0);
    expect(
      screen.getByText('61 banks, 10,500 branches in 64 districts'),
    ).toBeTruthy();
    expect(screen.getByText(/The list that comes with WeGro/)).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox'), 'rahima');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'rahima' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('verifies details someone else entered, keeping the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await queue([waiting()], () =>
      refuse
        ? failure(409, 'BANK_ACCOUNT_NOT_PENDING')
        : { body: { data: {} } },
    );
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Verify/ }))[0]!,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('0123456789')).toBeTruthy();
    const go = within(dialog).getByRole('button', { name: 'Verify' });
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.url.pathname).toBe(
      '/api/participants/u1/bank-account/verify',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: /Verify/ })[0]!,
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: /Verify/ })[0]!,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('rejects with a reason, and never lets who entered them verify', async () => {
    let refuse = true;
    const { sent } = await queue(
      [waiting({ enteredBy: { id: 'me', name: 'Me' } })],
      () => (refuse ? failure(503, 'X') : { body: { data: {} } }),
    );
    const verify = (
      await screen.findAllByRole('button', { name: /Verify/ })
    )[0]!;
    expect(verify.hasAttribute('disabled')).toBe(true);
    expect(
      screen.getAllByText(
        'You entered these details, so someone else verifies them.',
      ).length,
    ).toBeGreaterThan(0);
    await userEvent.click(
      screen.getAllByRole('button', { name: /Reject/ })[0]!,
    );
    const dialog = screen.getByRole('dialog');
    const send = within(dialog).getByRole('button', {
      name: 'Reject with This Reason',
    });
    await userEvent.type(
      within(dialog).getByLabelText('Reason (Shown to Them)'),
      'no',
    );
    await userEvent.click(send);
    expect(within(dialog).getByText(/at least 3/)).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Reason (Shown to Them)'),
      't the payee’s name',
    );
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.body).toEqual({
      reason: 'not the payee’s name',
    });
    await userEvent.click(
      screen.getAllByRole('button', { name: /Reject/ })[0]!,
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: /Reject/ })[0]!,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says when none wait or none match, and tries again', async () => {
    await queue([]);
    expect(
      await screen.findByText('No bank details are waiting.'),
    ).toBeTruthy();
    cleanup();
    let calls = 0;
    await show(
      'admin',
      <BankQueue search={{ q: 'zz' }} />,
      '/people/bank-details',
      (s) =>
        s.url.pathname === '/api/bank-accounts/pending'
          ? ++calls > 1
            ? { body: page([]) }
            : failure(500, 'X')
          : s.url.pathname === '/api/bank-list'
            ? listStatus({ branchCount: 0 })
            : undefined,
    );
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Try Again/ }))[0]!,
    );
    expect(await screen.findByText('No Matching People')).toBeTruthy();
    expect(screen.getByText('The bank list is empty.')).toBeTruthy();
  });
});

describe('the bank list', () => {
  it('replaces the list from the files chosen, and says who imported it', async () => {
    const forms = recordForms();
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    let refuse = true;
    await show('admin', <BankListCard />, '/people/bank-details', (s) => {
      if (s.method === 'POST')
        return refuse
          ? failure(422, 'BANK_LIST_INVALID')
          : { body: { data: { bankCount: 62, branchCount: 10600 } } };
      return listStatus({
        importedBy: { id: 'a', name: 'Admin Ayesha' },
      });
    });
    expect(await screen.findByText(/Imported by Admin Ayesha/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /Import New List/ }),
    );
    const dialog = screen.getByRole('dialog');
    const send = within(dialog).getByRole('button', {
      name: 'Import New List',
    });
    await userEvent.click(send);
    expect(
      within(dialog).getByText(
        'Choose the branches file (bank_branches.json).',
      ),
    ).toBeTruthy();
    await userEvent.upload(
      within(dialog).getByLabelText('Branches File (bank_branches.json)'),
      new File(['[]'], 'bank_branches.json', { type: 'application/json' }),
    );
    await userEvent.upload(
      within(dialog).getByLabelText(
        'Districts File (districts.json, Optional)',
      ),
      new File(['[]'], 'districts.json', { type: 'application/json' }),
    );
    await userEvent.click(send);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        'The bank list is replaced: 62 banks, 10,600 branches.',
      ),
    );
    expect(forms.at(-1)).toEqual([
      ['branches', 'bank_branches.json'],
      ['districts', 'districts.json'],
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: /Import New List/ }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: /Import New List/ }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says why the list cannot be read, and tries again', async () => {
    let calls = 0;
    await show('admin', <BankListCard />, '/people/bank-details', () =>
      ++calls > 1 ? listStatus({ importedAt: null }) : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByText('61 banks, 10,500 branches in 64 districts'),
    ).toBeTruthy();
    expect(screen.queryByText(/Imported by|comes with/)).toBeNull();
  });
});

describe('a payee’s bank details', () => {
  const card = (
    role: Role,
    accounts: BankAccountsDto | (() => Reply),
    write?: () => Reply,
  ) =>
    show(
      role,
      <PersonBankAccountCard personId="u1" personName="Rahima Begum" />,
      '/people/u1',
      (s) => {
        if (s.method !== 'GET') return write?.() ?? { body: { data: {} } };
        if (s.url.pathname === '/api/participants/u1/bank-account')
          return typeof accounts === 'function'
            ? accounts()
            : { body: { data: accounts } };
        if (s.url.pathname === '/api/bank-list/branches/200100405')
          return {
            body: {
              data: {
                routingNumber: '200100405',
                name: 'BOGRA BAZAR',
                bank: { code: 200, name: 'SONALI BANK LTD.' },
                district: { code: 610, name: 'BOGRA' },
              },
            },
          };
        if (s.url.pathname === '/api/bank-list/banks')
          return { body: { data: [{ code: 200, name: 'SONALI BANK LTD.' }] } };
        if (s.url.pathname === '/api/bank-list/banks/200/districts')
          return { body: { data: [{ code: 610, name: 'BOGRA' }] } };
        if (
          s.url.pathname === '/api/bank-list/banks/200/districts/610/branches'
        )
          return {
            body: {
              data: [{ routingNumber: '200100405', name: 'BOGRA BAZAR' }],
            },
          };
        return undefined;
      },
    );

  it('shows the account in use, the one waiting, and earlier ones', async () => {
    await card('admin', {
      verified: account({
        id: 'v',
        status: 'verified',
        decidedBy: { id: 'a', name: 'Admin Karim' },
        decidedAt: '2026-10-01T00:00:00Z',
      }),
      pending: account(),
      history: [
        account({
          id: 'r',
          status: 'rejected',
          rejectionReason: 'Wrong name',
          decidedBy: { id: 'a', name: 'Admin Karim' },
          decidedAt: '2026-09-01T00:00:00Z',
        }),
      ],
    });
    expect(await screen.findByText('Current Payout Account')).toBeTruthy();
    expect(screen.getByText('Pending Verification')).toBeTruthy();
    expect(screen.getByText(/Verified by Admin Karim/)).toBeTruthy();
    expect(screen.getByText(/Rejected by Admin Karim/)).toBeTruthy();
    expect(screen.getByText('Reason: Wrong name')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Verify/ })).toBeTruthy();
  });

  it('says when the last details were turned down, with or without a reason', async () => {
    await card('accounts', {
      verified: null,
      pending: null,
      history: [account({ status: 'rejected', rejectionReason: 'Blurry' })],
    });
    expect(
      await screen.findByText('The last details sent were not accepted.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Reason: Blurry').length).toBeGreaterThan(0);
    // Accounts look; they do not enter or decide.
    expect(
      screen.queryByRole('button', { name: /Edit Bank Details|Add/ }),
    ).toBeNull();
    cleanup();
    await card('accounts', {
      verified: null,
      pending: null,
      history: [account({ status: 'rejected' })],
    });
    expect(
      await screen.findByText('The last details sent were not accepted.'),
    ).toBeTruthy();
    expect(screen.queryByText(/^Reason:/)).toBeNull();
  });

  it('lets an admin change them from the branch on file, keeping the form when refused', async () => {
    let refuse = true;
    const { sent } = await card(
      'admin',
      { verified: account({ status: 'verified' }), pending: null, history: [] },
      () =>
        refuse
          ? failure(409, 'BANK_DETAILS_UNCHANGED')
          : { body: { data: {} } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit Bank Details/ }),
    );
    expect(
      ((await screen.findByLabelText('Routing Number')) as HTMLInputElement)
        .value,
    ).toBe('200100405');
    // Called off: back to the details as they are.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit Bank Details/ }),
    );
    await screen.findByLabelText('Routing Number');
    const send = screen.getByRole('button', {
      name: 'Submit for Verification',
    });
    await userEvent.click(send);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() =>
      expect(screen.queryByLabelText('Routing Number')).toBeNull(),
    );
    expect(writes(sent).at(-1)!.body).toEqual({
      holderName: 'Rahima Begum',
      accountNumber: '0123456789',
      routingNumber: '200100405',
    });
  });

  it('says why they cannot be loaded, and tries again', async () => {
    let calls = 0;
    await card('admin', () =>
      ++calls > 1
        ? { body: { data: { verified: null, pending: null, history: [] } } }
        : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No bank details yet.')).toBeTruthy();
  });
});
