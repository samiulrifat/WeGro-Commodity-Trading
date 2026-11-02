// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/app/navigation';
import { routeTree } from '@/routeTree.gen';
import { sessionEnded, sessionStarted } from '@/store/session-slice';
import { store } from '@/store/store';
import { fakeServer, type Sent, signedInAs } from '@/test/render';
import { captureInstallOffer } from '../pwa/install';

beforeAll(captureInstallOffer);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** `role` on `href` in the whole app, the server knowing their name. */
async function inApp(role: Role, href: string, fullName = 'Rahima Begum') {
  await signedInAs(role);
  const sent = fakeServer((s: Sent) =>
    s.url.pathname === '/api/auth/me'
      ? { body: { data: { id: 'me', role, fullName } } }
      : s.url.pathname === '/api/auth/logout'
        ? { body: {} }
        : undefined,
  );
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

const tokens = (role: Role, status: 'verified' | 'pending') => ({
  accessToken: 't',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
  user: { id: 'me', role, status, language: 'en' as const },
});

describe('the account menu', () => {
  it('shows who is signed in, opens their account, and signs out', async () => {
    const { router, sent } = await inApp(
      'admin',
      '/dashboard',
      ' rahima  begum ',
    );
    const menu = await screen.findByRole('button', { name: /Account/ });
    await waitFor(() => expect(menu.textContent).toContain('RB'));
    expect(menu.textContent).toContain('Admin');

    await userEvent.click(menu);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Account/ }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/account'),
    );

    await userEvent.click(screen.getByRole('button', { name: /Account/ }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Sign Out/ }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
    expect(sent.some((s) => s.url.pathname === '/api/auth/logout')).toBe(true);
  });
});

describe('the frame around every page', () => {
  it('goes to sign in when the session ends elsewhere, to come back after', async () => {
    const { router } = await inApp('admin', '/projects');
    await screen.findByRole('main');
    act(() => {
      store.dispatch(sessionEnded('expired'));
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
  });

  it('takes someone on to their home once verified while waiting', async () => {
    await signedInAs('investor');
    store.dispatch(sessionStarted(tokens('investor', 'pending')));
    fakeServer(() => undefined);
    const router = createRouter({
      routeTree,
      context: { store },
      history: createMemoryHistory({ initialEntries: ['/status'] }),
    });
    await router.load();
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );
    expect(await screen.findByText('Registration Under Review')).toBeTruthy();
    act(() => {
      store.dispatch(sessionStarted(tokens('investor', 'verified')));
    });
    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe('/status'),
    );
  });

  it('opens and closes a section’s pages in the side menu, one at a time', async () => {
    await inApp('admin', '/dashboard');
    const menus = await screen.findAllByRole('navigation', {
      name: 'Main Menu',
    });
    const side = within(menus[0]!);
    const people = side.getByRole('button', { name: /People/ });
    expect(people.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(people);
    expect(people.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(people);
    expect(people.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the rest of a long menu under More on phones', async () => {
    const { router } = await inApp('admin', '/dashboard');
    const menus = await screen.findAllByRole('navigation', {
      name: 'Main Menu',
    });
    const bar = within(menus.at(-1)!);
    await userEvent.click(bar.getByRole('button', { name: /More/ }));
    const sheet = await screen.findByRole('dialog', { name: 'More Pages' });
    const links = within(sheet).getAllByRole('link');
    const target = links.at(-1)!;
    const href = target.getAttribute('href');
    await userEvent.click(target);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(href);
  });
});

describe('installing from the account menu', () => {
  it('offers it there when the browser can install the app', async () => {
    await inApp('investor', '/projects');
    const prompt = vi.fn(() => Promise.resolve());
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt,
          userChoice: Promise.resolve({ outcome: 'accepted' }),
        }),
      );
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Account/ }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Install App/ }),
    );
    expect(prompt).toHaveBeenCalled();
  });
});
