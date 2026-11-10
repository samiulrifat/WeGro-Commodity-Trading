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
import type { ReceiptDetailDto, SiteDto } from '@/api/generated/warehouse';
import type { Role } from '@/app/navigation';
import { todayBd } from '@/lib/format';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { IssueDialog } from './issue-dialog';
import { ReceiptPage } from './receipt-page';
import { dayAfter, isReceiptId, parseSiteSearch } from './receipt-utils';
import { ReceiptsList } from './receipts-list';
import { SitesPage } from './sites-page';
import { VerifyReceiptPage } from './verify-receipt-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ID = `0x3f9a2c1b${'0'.repeat(56)}`;
const CHILD = `0x7a7a7a7a${'1'.repeat(56)}`;
const SITE = '11111111-1111-4111-8111-111111111111';
const page = <T,>(data: T[], totalPages = 1) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages },
});
const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});
const writes = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');

const site = (over: Partial<SiteDto> = {}): SiteDto => ({
  id: SITE,
  name: 'Bogura Central',
  districtCode: 'BOGURA',
  districtName: 'Bogura',
  address: 'Shibganj road, Bogura Sadar',
  storageType: 'warehouse',
  capacityKg: 500000,
  status: 'registered',
  closed: false,
  closedAt: null,
  operators: [{ id: 'me', name: 'Anwar Bepari' }],
  ...over,
});
const receipt = (over: Partial<ReceiptDetailDto> = {}): ReceiptDetailDto => ({
  id: ID,
  project: { id: 'p1', name: 'Potato in Rangpur #7' },
  site: { id: SITE, name: 'Bogura Central' },
  owner: { kind: 'farmer', id: 'f1', name: 'Karim Islam' },
  produce: {
    code: 'POTATO',
    name: 'Potato',
    nameBn: 'আলু',
    unit: 'kg',
    unitBn: 'কেজি',
  },
  quantity: 2000,
  originalQuantity: 2000,
  status: 'issued',
  pendingHandover: false,
  parentId: null,
  intake: {
    bagCount: 40,
    moisturePercent: '13.5',
    storageBay: 'Bay C-4',
    intakeDate: '2026-10-01',
    notes: null,
  },
  expiresOn: dayAfter(120),
  expired: false,
  issuedAt: '2026-10-01T05:00:00.000Z',
  collectedAt: null,
  detailsHash: '0x1',
  verifyUrl: `http://localhost:5173/verify/receipt/${ID}`,
  rechecks: [],
  children: [],
  ...over,
});
const catalog: Reply = {
  body: {
    data: {
      version: '1',
      units: [],
      produceTypes: [],
      inputTypes: [],
      fieldRecordTypes: [],
      weatherEventTypes: [],
      districts: [{ code: 'BOGURA', name: 'Bogura', division: 'Rajshahi' }],
    },
  },
};

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

describe('the site search', () => {
  it('keeps a search and an open or closed view', () => {
    expect(parseSiteSearch({ q: ' bogura ', state: 'closed' })).toEqual({
      q: 'bogura',
      state: 'closed',
    });
    expect(parseSiteSearch({ state: 'gone' })).toEqual({});
    expect(isReceiptId(ID)).toBe(true);
    expect(isReceiptId('0x12')).toBe(false);
  });
});

describe('issuing a receipt', () => {
  const answer =
    (sites: SiteDto[], write?: () => Reply) =>
    (s: Sent): Reply | undefined => {
      if (s.method === 'POST')
        return write?.() ?? { status: 201, body: { data: receipt() } };
      if (s.url.pathname === '/api/warehouse-sites')
        return { body: { data: sites } };
      if (s.url.pathname === '/api/projects')
        return {
          body: page([
            project({
              id: 'p7',
              title: 'Potato in Rangpur',
              category: 'storable_crop',
              produce: {
                code: 'POTATO',
                name: 'Potato',
                nameBn: 'আলু',
                unit: 'kg',
                unitBn: 'কেজি',
              },
            }),
            project({ id: 'p8', title: 'Tomato', category: 'perishable' }),
          ]),
        };
      return undefined;
    };

  it('names what is wrong, then issues it and opens the receipt', async () => {
    let refuse = true;
    const { sent, router } = await show(
      'warehouse',
      <IssueDialog onClose={() => undefined} />,
      '/warehouse',
      answer([site()], () =>
        refuse
          ? failure(409, 'PROJECT_STAGE_INVALID')
          : { status: 201, body: { data: receipt() } },
      ),
    );
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/Bogura Central/)).toBeTruthy();
    const issue = within(dialog).getByRole('button', { name: 'Issue Receipt' });
    await userEvent.type(within(dialog).getByLabelText('Bags'), '0');
    await userEvent.type(within(dialog).getByLabelText('Moisture (%)'), 'wet');
    fireEvent.change(within(dialog).getByLabelText('Intake Date'), {
      target: { value: dayAfter(2) },
    });
    fireEvent.change(within(dialog).getByLabelText('Valid Until'), {
      target: { value: todayBd() },
    });
    await userEvent.click(issue);
    for (const m of [
      'Choose a project.',
      'Enter a whole number of at least 1.',
      'Enter a whole number of bags, or leave it empty.',
      'The intake date cannot be in the future.',
      'Choose a day after today, not before the intake date.',
    ])
      expect(within(dialog).getByText(m)).toBeTruthy();

    // Fresh produce is not stored: only the potato project is offered.
    await userEvent.click(
      within(dialog).getByLabelText('Project', { selector: 'input' }),
    );
    expect(screen.queryByRole('option', { name: /Tomato/ })).toBeNull();
    await userEvent.click(
      await screen.findByRole('option', { name: /Potato in Rangpur/ }),
    );
    expect(within(dialog).getByText(/Potato · /)).toBeTruthy();
    expect(within(dialog).getByText('Quantity (kg)')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Quantity/), '২০০০');
    await userEvent.clear(within(dialog).getByLabelText('Bags'));
    await userEvent.type(within(dialog).getByLabelText('Bags'), '40');
    await userEvent.clear(within(dialog).getByLabelText('Moisture (%)'));
    await userEvent.type(within(dialog).getByLabelText('Moisture (%)'), '13.5');
    await userEvent.type(within(dialog).getByLabelText('Storage Bay'), ' C-4 ');
    await userEvent.type(within(dialog).getByLabelText('Notes'), ' Dry ');
    fireEvent.change(within(dialog).getByLabelText('Intake Date'), {
      target: { value: todayBd() },
    });
    fireEvent.change(within(dialog).getByLabelText('Valid Until'), {
      target: { value: dayAfter(180) },
    });
    await userEvent.click(issue);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(issue);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/warehouse/receipts/${ID}`),
    );
    expect(writes(sent).at(-1)!.body).toEqual({
      projectId: 'p7',
      quantity: 2000,
      intakeDate: todayBd(),
      expiresOn: dayAfter(180),
      bagCount: 40,
      moisturePercent: '13.5',
      storageBay: 'C-4',
      notes: 'Dry',
    });
  });

  it('cannot issue without a site, or at a closed one, and closes on Escape', async () => {
    const onClose = vi.fn();
    await show(
      'warehouse',
      <IssueDialog onClose={onClose} />,
      '/warehouse',
      answer([]),
    );
    expect(
      await screen.findByText(
        'You are not assigned to a site yet. Ask an admin.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Issue Receipt' })
        .hasAttribute('disabled'),
    ).toBe(true);
    cleanup();
    await show(
      'warehouse',
      <IssueDialog onClose={onClose} />,
      '/warehouse',
      answer([site({ closed: true })]),
    );
    expect(
      await screen.findByText('Your site is closed: it takes no new goods.'),
    ).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('the receipts list, further', () => {
  it('moves between tabs and pages, searches, and lets the operator issue', async () => {
    const { router } = await show(
      'warehouse',
      <ReceiptsList search={{}} />,
      '/warehouse',
      (s) =>
        s.url.pathname === '/api/warehouse-receipts'
          ? { body: page([receipt()], 2) }
          : s.url.pathname === '/api/warehouse-sites'
            ? { body: { data: [site()] } }
            : s.url.pathname === '/api/projects'
              ? { body: page([]) }
              : undefined,
    );
    await screen.findByText(/Karim Islam/);
    await userEvent.click(screen.getByRole('tab', { name: 'In Storage' }));
    expect(router.state.location.search).toEqual({ tab: 'issued' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'karim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'karim' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.click(
      screen.getByRole('button', { name: /Issue Receipt/ }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks by status, and tries again after an error', async () => {
    let calls = 0;
    const { sent } = await show(
      'admin',
      <ReceiptsList search={{ tab: 'listed' }} />,
      '/warehouse',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No Receipts Here')).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('status')).toBe('listed');
  });
});

describe('a receipt, further', () => {
  const at = (
    role: Role,
    r: ReceiptDetailDto | (() => Reply),
    write: (s: Sent) => Reply = () => ({ body: { data: receipt() } }),
  ) =>
    show(role, <ReceiptPage id={ID} />, `/warehouse/receipts/${ID}`, (s) => {
      if (s.method !== 'GET') return write(s);
      if (s.url.pathname === `/api/warehouse-receipts/${ID}`)
        return typeof r === 'function' ? r() : { body: { data: r } };
      if (s.url.pathname === '/api/warehouse-sites')
        return { body: { data: [site()] } };
      return undefined;
    });

  it('shows where it was split from and to, and each re-check', async () => {
    await at(
      'farmer',
      receipt({
        parentId: CHILD,
        children: [CHILD, ID],
        collectedAt: '2026-10-25T00:00:00Z',
        status: 'collected',
        intake: { ...receipt().intake, notes: 'Kept dry' },
        rechecks: [
          {
            checkedOn: '2026-10-10',
            newExpiresOn: dayAfter(200),
            bagCount: 38,
            moisturePercent: '12.5',
            storageBay: 'Bay D-1',
            notes: 'Fine',
          },
          {
            checkedOn: '2026-10-20',
            newExpiresOn: dayAfter(260),
            bagCount: null,
            moisturePercent: null,
            storageBay: null,
            notes: null,
          },
        ] as never,
      }),
    );
    expect(await screen.findByText('Quality Re-Checks')).toBeTruthy();
    expect(
      screen.getByText(
        /38 bags · Moisture \(%\): 12.5% · Storage Bay: Bay D-1/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Fine')).toBeTruthy();
    expect(screen.getByText('Kept dry')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /WR-7A7A7A7A/ })).toHaveLength(
      2,
    );
    expect(screen.getByRole('link', { name: /WR-3F9A2C1B/ })).toBeTruthy();
  });

  it('is collected by its site, keeping the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await at('warehouse', receipt(), () =>
      refuse
        ? failure(409, 'RECEIPT_NOT_ISSUED')
        : { body: { data: receipt({ status: 'collected' }) } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mark Collected' }),
    );
    const dialog = screen.getByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Mark Collected' });
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.url.pathname).toBe(
      `/api/warehouse-receipts/${ID}/collect`,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark Collected' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('has its offer withdrawn by the officer, or declined by an admin', async () => {
    const pending = receipt({
      status: 'pending_handover',
      pendingHandover: true,
    });
    let view = await at('field_officer', pending);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Withdraw Offer' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Withdraw Offer',
      }),
    );
    await waitFor(() =>
      expect(writes(view.sent).at(-1)?.url.pathname).toBe(
        `/api/warehouse-receipts/${ID}/handover/cancel`,
      ),
    );
    cleanup();
    view = await at('admin', pending);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Decline Buy-Back' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Decline Buy-Back',
      }),
    );
    await waitFor(() =>
      expect(writes(view.sent).at(-1)?.url.pathname).toBe(
        `/api/warehouse-receipts/${ID}/handover/cancel`,
      ),
    );
  });

  it('is re-checked only with dates that make sense, and keeps the dialog when refused', async () => {
    let refuse = true;
    const { sent } = await at('warehouse', receipt(), () =>
      refuse ? failure(409, 'RECEIPT_EXPIRED') : { body: { data: receipt() } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Re-Check and Extend' }),
    );
    const dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save Re-Check' });
    fireEvent.change(within(dialog).getByLabelText('Re-Check Date'), {
      target: { value: dayAfter(1) },
    });
    fireEvent.change(within(dialog).getByLabelText('New Valid Until'), {
      target: { value: todayBd() },
    });
    await userEvent.clear(within(dialog).getByLabelText('Bags'));
    await userEvent.type(within(dialog).getByLabelText('Bags'), 'x');
    await userEvent.click(save);
    expect(
      within(dialog).getByText('The re-check date cannot be in the future.'),
    ).toBeTruthy();
    expect(within(dialog).getByText(/Choose a day after/)).toBeTruthy();
    expect(writes(sent)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Re-Check Date'), {
      target: { value: todayBd() },
    });
    fireEvent.change(within(dialog).getByLabelText('New Valid Until'), {
      target: { value: dayAfter(300) },
    });
    await userEvent.clear(within(dialog).getByLabelText('Bags'));
    await userEvent.clear(within(dialog).getByLabelText('Storage Bay'));
    await userEvent.type(within(dialog).getByLabelText('Notes'), 'Rotated');
    await userEvent.click(save);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.body).toEqual({
      checkedOn: todayBd(),
      newExpiresOn: dayAfter(300),
      notes: 'Rotated',
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Re-Check and Extend' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says why it cannot be opened, and tries again', async () => {
    let calls = 0;
    await at('farmer', () =>
      ++calls > 1 ? { body: { data: receipt() } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Receipt Details')).toBeTruthy();
  });
});

describe('sites, further', () => {
  const answer =
    (sites: SiteDto[], write?: (s: Sent) => Reply) =>
    (s: Sent): Reply | undefined => {
      if (s.method !== 'GET') return write?.(s) ?? { body: { data: site() } };
      if (s.url.pathname === '/api/warehouse-sites')
        return { body: { data: sites } };
      if (s.url.pathname === '/api/catalog') return catalog;
      if (s.url.pathname === '/api/participants')
        return {
          body: page([
            { id: 'me', fullName: 'Anwar Bepari' },
            { id: 'op2', fullName: 'Rahima Khatun' },
          ]),
        };
      return undefined;
    };

  it('moves between open and closed, and searches', async () => {
    const { router, sent } = await show(
      'admin',
      <SitesPage search={{}} />,
      '/warehouse/sites',
      answer([site()]),
    );
    await screen.findByText('Bogura Central');
    await userEvent.click(screen.getByRole('tab', { name: 'Closed' }));
    expect(router.state.location.search).toEqual({ state: 'closed' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'bogura');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'bogura' });
    void sent;
  });

  it('says when there are none, none match, or the operator has none, and tries again', async () => {
    await show(
      'admin',
      <SitesPage search={{ q: 'zz' }} />,
      '/warehouse/sites',
      answer([]),
    );
    expect(await screen.findByText('No Site Matches Your Search')).toBeTruthy();
    cleanup();
    await show(
      'warehouse',
      <SitesPage search={{}} />,
      '/warehouse/sites',
      answer([]),
    );
    expect(
      await screen.findByText('You Are Not Assigned to a Site'),
    ).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    cleanup();
    let calls = 0;
    await show('auditor', <SitesPage search={{}} />, '/warehouse/sites', () =>
      ++calls > 1 ? { body: { data: [] } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No Sites Yet')).toBeTruthy();
  });

  it('adds a site once its details are right, keeping the form when refused', async () => {
    let refuse = true;
    const { sent } = await show(
      'admin',
      <SitesPage search={{}} />,
      '/warehouse/sites',
      answer([], () =>
        refuse
          ? failure(409, 'SITE_NAME_TAKEN')
          : { status: 201, body: { data: site() } },
      ),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Add Site/ }),
    );
    const dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Add Site' });
    await userEvent.type(within(dialog).getByLabelText('Capacity (kg)'), '0');
    await userEvent.click(save);
    for (const m of [
      'Enter the site’s name.',
      'Choose the district.',
      'Enter the full address.',
    ])
      expect(within(dialog).getByText(m)).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Site Name'),
      ' Rangpur Cold ',
    );
    await userEvent.click(
      within(dialog).getByLabelText('District', { selector: 'input' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Address'),
      ' Station road, Rangpur ',
    );
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Cold Storage' }),
    );
    await userEvent.clear(within(dialog).getByLabelText('Capacity (kg)'));
    await userEvent.click(save);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.body).toEqual({
      name: 'Rangpur Cold',
      districtCode: 'BOGURA',
      address: 'Station road, Rangpur',
      storageType: 'cold_storage',
    });
  });

  it('saves an unchanged site without asking the ledger, and reopens a closed one', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    let refuse = true;
    const { sent } = await show(
      'admin',
      <SitesPage search={{}} />,
      '/warehouse/sites',
      answer([site({ closed: true, closedAt: '2026-10-20T00:00:00Z' })], () =>
        refuse
          ? failure(503, 'LEDGER_UNAVAILABLE')
          : { body: { data: site() } },
      ),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit Site/ }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Save Site',
      }),
    );
    await waitFor(() => expect(ok).toHaveBeenCalledWith('Site saved.'));
    expect(writes(sent)).toHaveLength(0);
    // A closed site takes no new operator.
    expect(screen.queryByRole('button', { name: /Add Operator/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reopen Site' }));
    const dialog = screen.getByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Reopen Site' });
    await userEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.url.pathname).toBe(
      `/api/warehouse-sites/${SITE}/reopen`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reopen Site' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /Edit Site/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('adds an operator from those elsewhere, and removes one after asking', async () => {
    let refuse = true;
    const { sent } = await show(
      'admin',
      <SitesPage search={{}} />,
      '/warehouse/sites',
      answer([site()], () =>
        refuse
          ? failure(409, 'OPERATOR_NOT_VERIFIED')
          : { body: { data: site() } },
      ),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Add Operator/ }),
    );
    let dialog = screen.getByRole('dialog');
    // Who already works here is not offered.
    expect(
      within(dialog).queryByRole('button', { name: /Anwar Bepari/ }),
    ).toBeNull();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'rahima');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find' }));
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /Rahima Khatun/ }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: /Remove/ }));
    dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('Remove Anwar Bepari from Bogura Central?'),
    ).toBeTruthy();
    const remove = within(dialog).getByRole('button', { name: 'Remove' });
    await userEvent.click(remove);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(remove);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(sent).at(-1)!.body).toEqual({ siteId: null });
    await userEvent.click(screen.getByRole('button', { name: /Remove/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Remove/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says when no other operator can be added, and that a site has none', async () => {
    await show('admin', <SitesPage search={{}} />, '/warehouse/sites', (s) =>
      s.url.pathname === '/api/warehouse-sites'
        ? { body: { data: [site({ operators: [] })] } }
        : s.url.pathname === '/api/participants'
          ? { body: page([]) }
          : undefined,
    );
    expect(await screen.findByText('No operators yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Add Operator/ }));
    expect(
      await screen.findByText('No other verified warehouse operator found.'),
    ).toBeTruthy();
  });
});

describe('checking a receipt', () => {
  it('says why it cannot check, and tries again', async () => {
    let calls = 0;
    await show(
      'buyer',
      <VerifyReceiptPage id={ID} />,
      `/verify/receipt/${ID}`,
      () =>
        ++calls > 1
          ? { body: { data: { genuine: false } } }
          : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    await waitFor(() => expect(calls).toBe(2));
  });
});
