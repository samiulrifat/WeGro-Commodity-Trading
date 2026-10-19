// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import {
  accountDigits,
  branchOptions,
  isAccountNumber,
  parseBankQueueSearch,
} from './bank-details';
import { MyBankAccountCard } from './bank-account-card';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('bank details', () => {
  it('reads account numbers as people type them', () => {
    expect(accountDigits('0123-4567 89')).toBe('0123456789');
    expect(accountDigits('০১২৩৪৫৬৭')).toBe('01234567');
    expect(isAccountNumber('12345')).toBe(false);
    expect(isAccountNumber('123 456')).toBe(true);
    expect(isAccountNumber('1'.repeat(21))).toBe(false);
  });

  it('tells apart two branches of one name by their routing number', () => {
    expect(
      branchOptions([
        { routingNumber: '185100438', name: 'BANGLA BAZAR' },
        { routingNumber: '185100441', name: 'BANGLA BAZAR' },
        { routingNumber: '185100450', name: 'SADAR' },
      ]).map((o) => o.label),
    ).toEqual([
      'BANGLA BAZAR (185100438)',
      'BANGLA BAZAR (185100441)',
      'SADAR',
    ]);
  });

  it('keeps only a page and a search from the address', () => {
    expect(parseBankQueueSearch({ page: '2', q: ' rahim ', x: 1 })).toEqual({
      page: 2,
      q: 'rahim',
    });
    expect(parseBankQueueSearch({ page: '0', q: '' })).toEqual({});
  });

  it('picks bank, then district, then branch, and sends its routing number', async () => {
    await signedInAs('investor');
    const sent = fakeServer(({ url }) => {
      switch (url.pathname) {
        case '/api/me/bank-account':
          return {
            body: { data: { verified: null, pending: null, history: [] } },
          };
        case '/api/bank-list/banks':
          return {
            body: {
              data: [
                { code: 10, name: 'AGRANI BANK LTD.' },
                { code: 200, name: 'SONALI BANK LTD.' },
              ],
            },
          };
        case '/api/bank-list/banks/200/districts':
          return { body: { data: [{ code: 610, name: 'BOGRA' }] } };
        case '/api/bank-list/banks/200/districts/610/branches':
          return {
            body: {
              data: [
                { routingNumber: '200100405', name: 'BOGRA BAZAR' },
                { routingNumber: '200100434', name: 'BOGRA CANTONMENT' },
              ],
            },
          };
        default:
          return undefined;
      }
    });
    await renderPage(<MyBankAccountCard />, '/account');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add bank details' }),
    );

    // Nothing chosen: each missing piece is named.
    await userEvent.click(
      screen.getByRole('button', { name: 'Send for verification' }),
    );
    expect(screen.getByText('Choose the bank.')).toBeTruthy();
    expect(screen.getByText('Choose the branch.')).toBeTruthy();

    const choose = async (label: string, typed: string, option: string) => {
      const box = screen.getByLabelText(label, { selector: 'input' });
      await waitFor(() => expect(box.hasAttribute('disabled')).toBe(false));
      await userEvent.type(box, typed);
      await userEvent.click(
        await screen.findByRole('option', { name: option }),
      );
    };
    await choose('Bank', 'sona', 'SONALI BANK LTD.');
    await choose('District', 'bog', 'BOGRA');
    await choose('Branch', 'bazar', 'BOGRA BAZAR');
    expect(
      (screen.getByLabelText('Routing number') as HTMLInputElement).value,
    ).toBe('200100405');

    await userEvent.type(
      screen.getByLabelText('Account number'),
      '0123 4567 89',
    );
    await userEvent.type(
      screen.getByLabelText('Account name'),
      ' Rahima  Begum ',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Send for verification' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'PUT')?.body).toEqual({
        holderName: 'Rahima Begum',
        accountNumber: '0123456789',
        routingNumber: '200100405',
      }),
    );
  });
});
