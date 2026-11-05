// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
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

/**
 * Walks the steps up to creating the account. Keys go in without a pause
 * between them: about a hundred are typed, and with the default pause a
 * busy machine (a coverage run) takes the test past its time limit.
 */
async function upToCreate(email = '', password = 'my-own-password-1') {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: /Investor/ }));
  await afterTheRoles(user, email, password);
}

/** From the first step's Next on, to creating the account. */
async function afterTheRoles(
  user: ReturnType<typeof userEvent.setup>,
  email = '',
  password = 'my-own-password-1',
) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText('Mobile Number'), '01712345678');
  await user.click(screen.getByRole('button', { name: 'Send Code' }));
  await user.type(await screen.findByLabelText('SMS Code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText('Full Name'), 'Nasrin Akter');
  await user.type(screen.getByLabelText('NID Number'), '7123456789');
  await user.type(screen.getByLabelText('Date of Birth'), '2015-06-01');
  await user.type(screen.getByLabelText('Address'), 'Road 3, Khulna');
  await user.click(screen.getByRole('combobox', { name: 'District' }));
  await user.click(await screen.findByRole('option', { name: 'Khulna' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  if (password) {
    await user.type(
      screen.getByLabelText('New Password', { exact: true }),
      password,
    );
    await user.type(screen.getByLabelText('Confirm New Password'), password);
  }
  if (email) await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Create Account' }));
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
    expect(screen.getByLabelText('Date of Birth')).toBeTruthy();
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
    expect(await screen.findByText('Account Created')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Sign In' })).toBeTruthy();
    expect(sent.at(-1)!.body).toMatchObject({
      roles: ['investor'],
      phone: '01712345678',
      phoneCode: '123456',
      district: 'KHULNA',
      language: 'en',
    });
  });
});

const tokens = {
  accessToken: 't',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
  user: { id: 'u9', role: 'investor', status: 'pending', language: 'en' },
};
const refusedWith = (code: string, status = 409) => ({
  status,
  body: { statusCode: status, code, message: code },
});

describe('signing up, further', () => {
  it('asks for each step’s missing parts, and goes back a step', async () => {
    await signedOut();
    fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code') ? sentCode : undefined,
    );
    await renderPage(<SignUpPage />, '/register');
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /Investor/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // No number, no code: still the number.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Mobile Number')).toBeTruthy();
    await user.type(screen.getByLabelText('Mobile Number'), '01712345678');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText('Send a code first, then enter it here.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send Code' }));
    await user.type(await screen.findByLabelText('SMS Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('Fill this in.').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByLabelText('SMS Code')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByRole('button', { name: /Investor/ })).toBeTruthy();
  });

  it('takes one role or several, and at least one', async () => {
    await signedOut();
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname.endsWith('/sign-up/code')) return sentCode;
      if (method === 'POST' && url.pathname.endsWith('/sign-up')) {
        return {
          status: 201,
          body: {
            data: {
              accessToken: 't',
              tokenType: 'Bearer',
              expiresIn: 900,
              mustChangePassword: false,
              user: {
                id: 'u9',
                role: 'buyer',
                extraRoles: ['seller'],
                status: 'verified',
                language: 'en',
              },
            },
          },
        };
      }
      return undefined;
    });
    await renderPage(<SignUpPage />, '/register');
    const user = userEvent.setup({ delay: null });
    const card = (name: RegExp) => screen.getByRole('button', { name });
    const next = () =>
      screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;

    // Nothing chosen: cannot go on.
    expect(next().disabled).toBe(true);
    await user.click(card(/Buyer/));
    await user.click(card(/Seller/));
    await user.click(card(/Investor/));
    for (const r of [/Buyer/, /Seller/, /Investor/]) {
      expect(card(r).getAttribute('aria-pressed')).toBe('true');
    }
    expect(next().disabled).toBe(false);
    // Clicking again takes one off; taking all off stops them going on.
    await user.click(card(/Investor/));
    expect(card(/Investor/).getAttribute('aria-pressed')).toBe('false');
    await user.click(card(/Buyer/));
    await user.click(card(/Seller/));
    expect(next().disabled).toBe(true);
    await user.click(card(/Seller/));
    await user.click(card(/Buyer/));
    await afterTheRoles(user);
    await vi.waitFor(() =>
      expect(sent.at(-1)!.body).toMatchObject({ roles: ['seller', 'buyer'] }),
    );
  });

  it('goes back to the step a refusal is about', async () => {
    await signedOut();
    let refusal = refusedWith('CODE_INVALID', 400);
    fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code') ? sentCode : refusal,
    );
    await renderPage(<SignUpPage />, '/register');
    await upToCreate();
    // A wrong code: back at the number, the reason under the code.
    expect(await screen.findByLabelText('SMS Code')).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    const user = userEvent.setup({ delay: null });
    const forward = async () => {
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(screen.getByRole('button', { name: 'Create Account' }));
    };
    refusal = refusedWith('PHONE_ALREADY_REGISTERED');
    await forward();
    expect(
      await screen.findByText('This phone number is already registered.'),
    ).toBeTruthy();
    refusal = refusedWith('NID_ALREADY_REGISTERED');
    await forward();
    expect(
      await screen.findByText('A person with this NID is already registered.'),
    ).toBeTruthy();
    refusal = refusedWith('SOMETHING_ELSE', 503);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    // The password step stays, with the reason.
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByLabelText('Full Name')).toBeTruthy();
  });

  it('signs in at once, then confirms the email given, or later', async () => {
    await signedOut();
    let wrong = true;
    const sent = fakeServer(({ url }) => {
      if (url.pathname.endsWith('/sign-up/code')) return sentCode;
      if (url.pathname === '/api/auth/sign-up')
        return { status: 201, body: { data: tokens } };
      if (url.pathname === '/api/auth/me/email/code')
        return {
          body: { data: { resendAfterSeconds: 0, expiresInSeconds: 600 } },
        };
      if (url.pathname === '/api/auth/me/email')
        return wrong
          ? refusedWith('CODE_INVALID', 400)
          : { body: { data: {} } };
      return undefined;
    });
    const { router } = await renderPage(<SignUpPage />, '/register');
    await upToCreate('Nasrin@Example.com');
    expect(
      (await screen.findAllByText(/Nasrin@Example.com/)).length,
    ).toBeGreaterThan(0);
    expect(store.getState().session.accessToken).toBe('t');
    await waitFor(() =>
      expect(
        sent.some((s) => s.url.pathname === '/api/auth/me/email/code'),
      ).toBe(true),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByText('Enter the 6 digits of the code.')).toBeTruthy();
    await user.type(await screen.findByLabelText('Email Code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    wrong = false;
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe('/register'),
    );
    expect(
      sent.find((s) => s.url.pathname === '/api/auth/me/email')!.body,
    ).toEqual({
      email: 'nasrin@example.com',
      code: '654321',
    });
  });

  it('goes straight in without an email, and lets the email wait', async () => {
    await signedOut();
    fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code')
        ? sentCode
        : url.pathname === '/api/auth/sign-up'
          ? { status: 201, body: { data: tokens } }
          : {
              body: { data: { resendAfterSeconds: 0, expiresInSeconds: 600 } },
            },
    );
    let view = await renderPage(<SignUpPage />, '/register');
    await upToCreate();
    await waitFor(() =>
      expect(view.router.state.location.pathname).not.toBe('/register'),
    );
    cleanup();

    await signedOut();
    fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code')
        ? sentCode
        : url.pathname === '/api/auth/sign-up'
          ? { status: 201, body: { data: tokens } }
          : {
              body: { data: { resendAfterSeconds: 0, expiresInSeconds: 600 } },
            },
    );
    view = await renderPage(<SignUpPage />, '/register');
    await upToCreate('later@example.com');
    await userEvent.click(await screen.findByRole('button', { name: /Later/ }));
    await waitFor(() =>
      expect(view.router.state.location.pathname).not.toBe('/register'),
    );
  });

  it('wants a password before creating anything', async () => {
    await signedOut();
    const sent = fakeServer(({ url }) =>
      url.pathname.endsWith('/sign-up/code') ? sentCode : undefined,
    );
    await renderPage(<SignUpPage />, '/register');
    await upToCreate('', '');
    expect(screen.getByText('Use at least 10 characters.')).toBeTruthy();
    expect(sent.some((s) => s.url.pathname === '/api/auth/sign-up')).toBe(
      false,
    );
  });
});
