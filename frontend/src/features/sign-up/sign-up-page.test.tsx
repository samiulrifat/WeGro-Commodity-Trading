// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseApi } from '@/api/base-api';
import { applyLanguage, initI18n } from '@/i18n';
import { sessionEnded } from '@/store/session-slice';
import { store } from '@/store/store';
import { fakeServer, renderPage } from '@/test/render';
import { SignUpPage } from './sign-up-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sentCode = {
  body: { data: { resendAfterSeconds: 60, expiresInSeconds: 600 } },
};

/** Walks the steps up to creating the account. */
async function upToCreate() {
  await userEvent.click(screen.getByRole('button', { name: /Investor/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.type(screen.getByLabelText('Mobile number'), '01712345678');
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  await userEvent.type(
    await screen.findByLabelText('Code from the SMS'),
    '123456',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.type(screen.getByLabelText('Full name'), 'Nasrin Akter');
  await userEvent.type(screen.getByLabelText('NID number'), '7123456789');
  await userEvent.type(screen.getByLabelText('Date of birth'), '2015-06-01');
  await userEvent.type(screen.getByLabelText('Address'), 'Road 3, Khulna');
  await userEvent.click(screen.getByRole('combobox', { name: 'District' }));
  await userEvent.click(await screen.findByRole('option', { name: 'Khulna' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.type(
    screen.getByLabelText('New password', { exact: true }),
    'my-own-password-1',
  );
  await userEvent.type(
    screen.getByLabelText('Type the new password again'),
    'my-own-password-1',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

async function signedOut() {
  await initI18n('en');
  await applyLanguage('en');
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(sessionEnded());
}

describe('signing up', () => {
  it('goes back to the details, the ID check’s reason under the field', async () => {
    await signedOut();
    fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code')
        ? sentCode
        : {
            status: 422,
            body: {
              statusCode: 422,
              code: 'ID_CHECK_FAILED',
              message: 'The ID check failed',
              details: {
                checks: [
                  {
                    code: 'AGE',
                    result: 'fail',
                    reason: 'AGE_UNDER',
                    message: 'Must be at least 18 years old',
                    params: { min: 18 },
                  },
                ],
              },
            },
          },
    );
    await renderPage(<SignUpPage />, '/register');
    await upToCreate();
    expect(
      await screen.findByText('Must be at least 18 years old.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Date of birth')).toBeTruthy();
  });

  it('says the account is created when the ledger is still confirming it', async () => {
    await signedOut();
    const sent = fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code')
        ? sentCode
        : {
            status: 403,
            body: {
              statusCode: 403,
              code: 'REGISTRATION_CONFIRMING',
              message: 'Your account is created and is being confirmed.',
              details: { created: true },
            },
          },
    );
    await renderPage(<SignUpPage />, '/register');
    await upToCreate();
    expect(await screen.findByText('Your account is created')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toBeTruthy();
    expect(sent.at(-1)!.body).toMatchObject({
      role: 'investor',
      phone: '01712345678',
      phoneCode: '123456',
      district: 'KHULNA',
      language: 'en',
    });
  });
});
