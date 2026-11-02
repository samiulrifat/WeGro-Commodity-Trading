// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeServer,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { PaymentAccountsPage } from './payment-accounts-page';
import type { RefundsSearch } from './projects-search';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sonali = {
  id: 'a1',
  bankName: 'SONALI BANK LTD.',
  branchName: 'BOGRA BAZAR',
  districtName: 'BOGRA',
  routingNumber: '200100405',
  accountName: 'WeGro Collections',
  accountNumber: '0123456789',
  sortOrder: 1,
  active: true,
};
const agrani = {
  ...sonali,
  id: 'a2',
  bankName: 'AGRANI BANK LTD.',
  branchName: 'MOTIJHEEL',
  districtName: null,
  routingNumber: '010274906',
  accountNumber: '9988776655',
  active: false,
};

/** The accounts, the bank list for the branch picker, and `write` for saves. */
async function page(
  search: RefundsSearch = {},
  over: { accounts?: () => Reply; write?: (sent: Sent) => Reply } = {},
) {
  await signedInAs('accounts');
  const sent = fakeServer((s) => {
    if (s.method !== 'GET') return over.write?.(s) ?? { body: { data: {} } };
    switch (s.url.pathname) {
      case '/api/payment-accounts/all':
        return over.accounts?.() ?? { body: { data: [sonali, agrani] } };
      case '/api/bank-list/banks':
        return { body: { data: [{ code: 200, name: 'SONALI BANK LTD.' }] } };
      case '/api/bank-list/banks/200/districts':
        return { body: { data: [{ code: 610, name: 'BOGRA' }] } };
      case '/api/bank-list/banks/200/districts/610/branches':
        return {
          body: { data: [{ routingNumber: '200100405', name: 'BOGRA BAZAR' }] },
        };
      case '/api/bank-list/branches/200100405':
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
      default:
        return undefined;
    }
  });
  const view = await renderPage(
    <PaymentAccountsPage search={search} />,
    '/projects/payment-accounts',
  );
  return { sent, ...view };
}

const choose = async (label: string, typed: string, option: string) => {
  const box = screen.getByLabelText(label, { selector: 'input' });
  await waitFor(() => expect(box.hasAttribute('disabled')).toBe(false));
  await userEvent.type(box, typed);
  await userEvent.click(await screen.findByRole('option', { name: option }));
};

describe('the payment accounts page', () => {
  it('lists the accounts, in use or retired, and finds them by word starts', async () => {
    const { router } = await page();
    expect(await screen.findByText('SONALI BANK LTD.')).toBeTruthy();
    expect(screen.getByText('BOGRA BAZAR, BOGRA · 200100405')).toBeTruthy();
    expect(screen.getByText('MOTIJHEEL · 010274906')).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox'), 'agra');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'agra' });
    cleanup();
    await page({ q: 'sonali baz' });
    expect(await screen.findByText('SONALI BANK LTD.')).toBeTruthy();
    expect(screen.queryByText('AGRANI BANK LTD.')).toBeNull();
    cleanup();
    await page({ q: 'ani' }); // the middle of a word does not count
    expect(await screen.findByText('Nothing matches')).toBeTruthy();
  });

  it('adds an account from the bank list, naming what is missing first', async () => {
    const { sent } = await page();
    await userEvent.click(
      await screen.findByRole('button', { name: /Add Payment Account/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Choose the bank.')).toBeTruthy();
    expect(within(dialog).getByText('Enter the account name.')).toBeTruthy();
    expect(
      within(dialog).getByText('Enter the account number: 6 to 20 digits.'),
    ).toBeTruthy();
    await choose('Bank', 'sona', 'SONALI BANK LTD.');
    await choose('District', 'bog', 'BOGRA');
    await choose('Branch', 'baz', 'BOGRA BAZAR');
    await userEvent.type(
      within(dialog).getByLabelText('Account Name'),
      ' WeGro Farm Fund ',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Account Number'),
      '1122 3344 55',
    );
    const order = within(dialog).getByLabelText('Display Order');
    await userEvent.clear(order);
    await userEvent.type(order, '5000');
    expect(within(dialog).queryByRole('switch', { name: /In Use/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = sent.find((s) => s.method === 'POST')!;
    expect(posted.url.pathname).toBe('/api/payment-accounts');
    expect(posted.body).toEqual({
      routingNumber: '200100405',
      accountName: 'WeGro Farm Fund',
      accountNumber: '1122334455',
      sortOrder: 1000, // at most 1000
    });
  });

  it('changes an account starting from its branch, and can retire it', async () => {
    const { sent } = await page();
    const card = (await screen.findByText('SONALI BANK LTD.')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Edit Payment Account' }),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText('Account Name') as HTMLInputElement).value,
    ).toBe('WeGro Collections');
    await userEvent.click(
      within(dialog).getByRole('switch', { name: /In Use/ }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patched = sent.find((s) => s.method === 'PATCH')!;
    expect(patched.url.pathname).toBe('/api/payment-accounts/a1');
    expect(patched.body).toEqual({
      routingNumber: '200100405',
      accountName: 'WeGro Collections',
      accountNumber: '0123456789',
      sortOrder: 1,
      active: false,
    });
  });

  it('keeps the form open with the reason when the save is refused, and closes on Cancel', async () => {
    await page(
      {},
      {
        write: () => ({
          status: 409,
          body: {
            statusCode: 409,
            code: 'PAYMENT_ACCOUNT_EXISTS',
            message: 'That account is already listed',
          },
        }),
      },
    );
    const card = (await screen.findByText('SONALI BANK LTD.')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says when there are no accounts yet, and tries again after an error', async () => {
    let calls = 0;
    await page(
      {},
      {
        accounts: () =>
          ++calls > 1
            ? { body: { data: [] } }
            : {
                status: 500,
                body: { statusCode: 500, code: 'X', message: 'x' },
              },
      },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No payment accounts yet')).toBeTruthy();
    expect(
      screen.getByText('Add one so investors know where to pay.'),
    ).toBeTruthy();
  });

  it('closes the form on Escape', async () => {
    await page();
    const card = (await screen.findByText('SONALI BANK LTD.')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: /Edit/ }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
