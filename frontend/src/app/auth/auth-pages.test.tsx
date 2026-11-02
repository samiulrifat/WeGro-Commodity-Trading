// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TokenResponseDto } from '@/api/generated/auth';
import type { Role } from '@/app/navigation';
import { routeTree } from '@/routeTree.gen';
import { sessionEnded, sessionStarted } from '@/store/session-slice';
import { store } from '@/store/store';
import { fakeServer, type Reply, type Sent, signedInAs } from '@/test/render';
import { captureInstallOffer } from '../pwa/install';

beforeAll(captureInstallOffer);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const tokens = (
  role: Role = 'investor',
  mustChangePassword = false,
): TokenResponseDto => ({
  accessToken: 'new-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword,
  user: { id: 'u1', role, status: 'verified', language: 'en' },
});

/** Opens `href` with nobody signed in (the last session `ended` so). */
async function signedOut(
  href: string,
  answer: (s: Sent) => Reply | undefined = () => undefined,
  ended?: 'expired' | 'signedOut',
) {
  await signedInAs('investor');
  store.dispatch(sessionEnded(ended));
  const sent = fakeServer(answer);
  const router = createRouter({
    routeTree,
    context: { store },
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  await router.load();
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { sent, router };
}

const posted = (sent: Sent[], path: string) =>
  sent.filter((s) => s.method === 'POST' && s.url.pathname === path);
const refused = (code: string, status = 401): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});

describe('signing in', () => {
  it('asks for both, then signs in by number and goes back where they were', async () => {
    const { sent, router } = await signedOut(
      '/sign-in?redirect=%2Fprojects',
      (s) =>
        s.url.pathname === '/api/auth/login'
          ? { body: { data: tokens() } }
          : undefined,
      'expired',
    );
    expect(
      screen.getByText('Your session has ended. Please sign in again.'),
    ).toBeTruthy();
    // No demo accounts on this server: no tabs.
    expect(screen.queryByRole('tab')).toBeNull();
    const submit = screen.getByRole('button', { name: 'Sign In' });
    await userEvent.click(submit);
    expect(screen.getByText('Enter your mobile number.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();

    await userEvent.type(
      screen.getByLabelText('Mobile Number'),
      ' ০১৭১২৩৪৫৬৭৮ ',
    );
    expect(
      screen
        .getByRole('link', { name: 'Forgot Password?' })
        .getAttribute('href'),
    ).toContain('phone=');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    const show = screen.getByRole('button', { name: 'Show Password' });
    await userEvent.click(show);
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text');
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide Password' }),
    );
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe(
      'password',
    );
    await userEvent.click(submit);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects'),
    );
    expect(posted(sent, '/api/auth/login')[0]!.body).toEqual({
      phone: '01712345678',
      password: 'secret-pass',
    });
    expect(store.getState().session.accessToken).toBe('new-token');
  });

  it('signs in by email, remembered next time, and says why it was refused', async () => {
    let refuse = true;
    await signedOut('/sign-in', (s) =>
      s.url.pathname === '/api/auth/login'
        ? refuse
          ? refused('BAD_CREDENTIALS')
          : { body: { data: tokens('buyer') } }
        : undefined,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Email' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    cleanup();

    // The device keeps the choice.
    await signedOut('/sign-in', (s) =>
      s.url.pathname === '/api/auth/login'
        ? refuse
          ? refused('BAD_CREDENTIALS')
          : { body: { data: tokens('buyer') } }
        : undefined,
    );
    await userEvent.type(
      screen.getByLabelText('Email'),
      ' ayesha@example.com ',
    );
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    expect(
      screen
        .getByRole('link', { name: 'Forgot Password?' })
        .getAttribute('href'),
    ).toBe('/forgot-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull(),
    );
  });

  it('offers to install the app where the browser can', async () => {
    await signedOut('/sign-in');
    const prompt = vi.fn(() => Promise.resolve());
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt,
          userChoice: Promise.resolve({ outcome: 'dismissed' }),
        }),
      );
    });
    await userEvent.click(screen.getByRole('button', { name: /Install App/ }));
    expect(prompt).toHaveBeenCalled();
  });

  it('signs in as a demo role, or says why not', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    let refuse = true;
    const { sent, router } = await signedOut('/sign-in', (s) => {
      if (s.url.pathname === '/api/auth/demo/accounts')
        return {
          body: {
            data: [
              { role: 'farmer', fullName: 'Demo Farmer' },
              { role: 'admin', fullName: 'Demo Admin' },
            ],
          },
        };
      if (s.url.pathname === '/api/auth/demo/login')
        return refuse
          ? refused('DEMO_DISABLED', 404)
          : { body: { data: tokens('farmer') } };
      return undefined;
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Demo' }));
    expect(screen.getByText('Demo: Choose a Role')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Farmer/ }));
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: /Farmer/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe('/sign-in'),
    );
    expect(posted(sent, '/api/auth/demo/login').at(-1)!.body).toEqual({
      role: 'farmer',
    });
    failed.mockRestore();
  });
});

describe('resetting a forgotten password', () => {
  const sentCode: Reply = {
    body: { data: { resendAfterSeconds: 0, expiresInSeconds: 600 } },
  };

  it('goes from the number to the code to a new password, and signs in', async () => {
    const { sent, router } = await signedOut(
      '/forgot-password?phone=01712345678',
      (s) => {
        switch (s.url.pathname) {
          case '/api/auth/password-reset/request':
            return sentCode;
          case '/api/auth/password-reset/verify':
            return { body: { data: { valid: true } } };
          case '/api/auth/password-reset/complete':
            return { body: { data: tokens('farmer') } };
          default:
            return undefined;
        }
      },
    );
    expect(
      (screen.getByLabelText('Mobile Number') as HTMLInputElement).value,
    ).toBe('01712345678');
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    expect(
      await screen.findByText(
        'If this number has a WeGro account, a 6-digit code is on its way. It works for 10 minutes.',
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter the 6 digits from the SMS.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('SMS Code'), '১২৩৪৫৬');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        'Choose a new password. Every other device will be signed out.',
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and Sign In' }),
    );
    expect(screen.getByText('Use at least 10 characters.')).toBeTruthy();
    await userEvent.type(
      screen.getByLabelText('New Password'),
      'a-long-password',
    );
    await userEvent.type(
      screen.getByLabelText('Confirm New Password'),
      'a-long-password',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and Sign In' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe('/forgot-password'),
    );
    expect(posted(sent, '/api/auth/password-reset/verify')[0]!.body).toEqual({
      phone: '01712345678',
      code: '123456',
    });
    expect(posted(sent, '/api/auth/password-reset/complete')[0]!.body).toEqual({
      phone: '01712345678',
      code: '123456',
      newPassword: 'a-long-password',
    });
  });

  it('asks for the number, says why a code was refused, and goes back for another number', async () => {
    let calls = 0;
    const { sent } = await signedOut('/forgot-password', (s) => {
      if (s.url.pathname === '/api/auth/password-reset/request')
        return ++calls === 1
          ? refused('TOO_MANY_REQUESTS', 429)
          : {
              body: { data: { resendAfterSeconds: 60, expiresInSeconds: 600 } },
            };
      if (s.url.pathname === '/api/auth/password-reset/verify')
        return refused('CODE_INVALID', 400);
      return undefined;
    });
    expect(
      screen.getByText(
        'Enter your mobile number. We will send you a 6-digit code by SMS.',
      ),
    ).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send Code' });
    await userEvent.click(send);
    expect(screen.getByText('Enter your mobile number.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Mobile Number'), '01712345678');
    await userEvent.click(send);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.click(send);
    expect(
      await screen.findByText('You can ask for a new code in 60 seconds.'),
    ).toBeTruthy();
    await userEvent.type(screen.getByLabelText('SMS Code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a Different Number' }),
    );
    expect(screen.getByLabelText('Mobile Number')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posted(sent, '/api/auth/password-reset/request')).toHaveLength(2);
    expect(
      screen
        .getByRole('link', { name: 'Back to Sign In' })
        .getAttribute('href'),
    ).toBe('/sign-in');
  });

  it('asks for a new code when the old one ran out meanwhile, and shows other refusals', async () => {
    let expired = true;
    const { sent } = await signedOut(
      '/forgot-password?phone=01712345678',
      (s) => {
        switch (s.url.pathname) {
          case '/api/auth/password-reset/request':
            return sentCode;
          case '/api/auth/password-reset/verify':
            return { body: { data: { valid: true } } };
          case '/api/auth/password-reset/complete':
            return expired
              ? refused('CODE_EXPIRED', 400)
              : refused('PASSWORD_TOO_COMMON', 422);
          default:
            return undefined;
        }
      },
    );
    const toPassword = async () => {
      await userEvent.type(screen.getByLabelText('SMS Code'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.type(
        await screen.findByLabelText('New Password'),
        'a-long-password',
      );
      await userEvent.type(
        screen.getByLabelText('Confirm New Password'),
        'a-long-password',
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Save and Sign In' }),
      );
    };
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    await screen.findByLabelText('SMS Code');
    await toPassword();
    // Back on the code step, with why, and a new code at once.
    expect(await screen.findByLabelText('SMS Code')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Resend Code' }));
    await waitFor(() =>
      expect(posted(sent, '/api/auth/password-reset/request')).toHaveLength(2),
    );
    expired = false;
    await toPassword();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('New Password')).toBeTruthy();
  });
});

describe('changing a temporary password', () => {
  async function temporary(answer: (s: Sent) => Reply | undefined) {
    await signedInAs('farmer');
    store.dispatch(sessionStarted(tokens('farmer', true)));
    const sent = fakeServer(answer);
    const router = createRouter({
      routeTree,
      context: { store },
      history: createMemoryHistory({ initialEntries: ['/change-password'] }),
    });
    await router.load();
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );
    return { sent, router };
  }

  it('asks for the temporary one and a new one, then goes on signed in afresh', async () => {
    let refuse = true;
    const { sent, router } = await temporary((s) =>
      s.url.pathname === '/api/auth/change-password'
        ? refuse
          ? refused('BAD_CREDENTIALS')
          : { body: { data: tokens('farmer') } }
        : undefined,
    );
    expect(screen.getByText('Set Your Password')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save and Continue' });
    await userEvent.click(save);
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    await userEvent.type(
      screen.getByLabelText('Temporary Password'),
      'Tmp-7Xq-42',
    );
    await userEvent.type(
      screen.getByLabelText('New Password'),
      'my-own-password',
    );
    await userEvent.type(
      screen.getByLabelText('Confirm New Password'),
      'my-own-passwork',
    );
    await userEvent.click(save);
    expect(
      screen.getByText('The two passwords are not the same.'),
    ).toBeTruthy();
    await userEvent.clear(screen.getByLabelText('Confirm New Password'));
    await userEvent.type(
      screen.getByLabelText('Confirm New Password'),
      'my-own-password',
    );
    await userEvent.click(save);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(save);
    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe('/change-password'),
    );
    expect(posted(sent, '/api/auth/change-password').at(-1)!.body).toEqual({
      currentPassword: 'Tmp-7Xq-42',
      newPassword: 'my-own-password',
    });
    expect(store.getState().session.mustChangePassword).toBe(false);
  });

  it('lets them sign out instead', async () => {
    const { router, sent } = await temporary(() => ({ body: {} }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
    expect(posted(sent, '/api/auth/logout')).toHaveLength(1);
    expect(store.getState().session.status).toBe('signedOut');
  });

  it('sends someone signed out to sign in', async () => {
    const { router } = await signedOut('/change-password');
    expect(router.state.location.pathname).toBe('/sign-in');
  });
});
