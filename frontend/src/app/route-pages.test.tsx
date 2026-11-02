// @vitest-environment jsdom
import {
  type AnyRoute,
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '@/routeTree.gen';
import { sessionStarted } from '@/store/session-slice';
import { type AppStore, store } from '@/store/store';
import { fakeServer, signedInAs } from '@/test/render';
import { access, type Area, type Role, type SubPath } from './navigation';
import { NotFoundPage, PageError, PageLoading } from './pages';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROLES: readonly Role[] = [
  'super_admin',
  'admin',
  'accounts',
  'operations',
  'field_officer',
  'auditor',
  'farmer',
  'investor',
  'buyer',
  'seller',
  'supplier',
  'bank',
  'warehouse',
  'insurer',
];

/** Where a page belongs: who may open it (see navigation.ts). */
type Place = { area?: Area; page?: SubPath };

/** Every page of the route tree, its path parameters filled in. */
const probe = createRouter({ routeTree, context: { store } });
const pages = (Object.values(probe.routesByPath) as AnyRoute[])
  .filter((r) => r.path !== '/' || r.fullPath === '/')
  .map((r) => {
    // A page's place is its own, or the nearest layout's above it.
    let data: Place | undefined;
    for (let at: AnyRoute | undefined = r; at && !data; at = at.parentRoute)
      data = at.options.staticData as Place | undefined;
    return {
      path: r.fullPath.replace(/\/$/, '') || '/',
      href: r.fullPath
        // A record's history needs a kind of record it knows.
        .replace('$type', 'project')
        .replace(/\$[A-Za-z]+/g, 'x')
        .replace(/(.)\/$/, '$1'),
      data,
    };
  });

/**
 * Pages that send a signed-in, verified reader elsewhere: home, a section's
 * first page, or past the sign-in pages (each has tests of its own).
 */
const MOVES: Record<string, string> = {
  '/': '/dashboard',
  '/catalog': '/catalog/units',
  '/status': '/dashboard',
  '/sign-in': '/dashboard',
  '/register': '/dashboard',
  '/forgot-password': '/dashboard',
  '/change-password': '/dashboard',
};

/** The first role that may open a page with this area and section page. */
function roleFor(data: Place | undefined): Role {
  return (
    ROLES.find(
      (role) =>
        access(
          {
            status: 'signedIn',
            user: { id: 'me', role, status: 'verified', language: 'en' },
            mustChangePassword: false,
          } as never,
          data?.area,
          data?.page,
        ) === 'ok',
    ) ?? 'super_admin'
  );
}

describe('every page', () => {
  it('is found', () => {
    expect(pages.length).toBeGreaterThan(80);
  });

  it.each(pages)('$path opens', { timeout: 30_000 }, async ({ href, data }) => {
    await signedInAs(roleFor(data));
    fakeServer(() => undefined);
    const router = createRouter({
      routeTree,
      context: { store },
      history: createMemoryHistory({ initialEntries: [href] }),
      defaultPendingComponent: PageLoading,
      defaultErrorComponent: PageError,
      defaultNotFoundComponent: NotFoundPage,
    });
    await router.load();
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );
    // The page itself is drawn, unless it sends a signed-in reader on.
    expect(router.state.location.pathname).toBe(MOVES[href] ?? href);
    await waitFor(() =>
      expect(document.querySelector('main, h1')).toBeTruthy(),
    );
    expect(screen.queryByText('Page Not Found')).toBeNull();
    expect(screen.queryByText('Not Available for Your Role')).toBeNull();
  });
});

/** Opens `href` in the real route tree, its guards reading `context`. */
async function open(href: string, context: AppStore = store) {
  const router = createRouter({
    routeTree,
    context: { store: context },
    history: createMemoryHistory({ initialEntries: [href] }),
    defaultNotFoundComponent: NotFoundPage,
  });
  await router.load();
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return router;
}

/** A store for the guards that has not heard from the server yet. */
const unknownSession = {
  getState: () => ({ session: { status: 'unknown', user: null } }),
  dispatch: () => undefined,
} as unknown as AppStore;

describe('the page guards', () => {
  // The server cannot be reached, and nobody signed in here before.
  const unreachable = async () => {
    await signedInAs('admin');
    localStorage.clear();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
  };

  it('send someone not signed in to sign in, coming back after', async () => {
    await unreachable();
    const router = await open('/dashboard', unknownSession);
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toEqual({ redirect: '/dashboard' });
  });

  it.each(['/sign-in', '/register', '/forgot-password'])(
    'still show %s when the session cannot be checked',
    async (href) => {
      await unreachable();
      const router = await open(href, unknownSession);
      expect(router.state.location.pathname).toBe(href);
    },
  );

  it.each(['/dashboard', '/sign-in', '/register', '/forgot-password'])(
    'pass on any other failure of the session check on %s',
    async (href) => {
      await signedInAs('admin');
      const broken = {
        getState: () => {
          throw new Error('store broken');
        },
        dispatch: () => undefined,
      } as unknown as AppStore;
      const router = await open(href, broken);
      expect(
        router.state.matches.some(
          (m) =>
            m.status === 'error' &&
            (m.error as Error | undefined)?.message === 'store broken',
        ),
      ).toBe(true);
    },
  );

  it('hide the design page outside development', async () => {
    await signedInAs('admin');
    fakeServer(() => undefined);
    vi.stubEnv('DEV', false);
    try {
      await open('/design');
      expect(await screen.findByText('Page Not Found')).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('allow nothing but changing a temporary password', async () => {
    await signedInAs('admin');
    fakeServer(() => undefined);
    store.dispatch(
      sessionStarted({
        accessToken: 't',
        tokenType: 'Bearer',
        expiresIn: 900,
        mustChangePassword: true,
        user: { id: 'me', role: 'admin', status: 'verified', language: 'en' },
      }),
    );
    const router = await open('/dashboard');
    expect(router.state.location.pathname).toBe('/change-password');
  });

  it('say a page is not found, outside the app or for a record kind it does not know', async () => {
    await signedInAs('admin');
    fakeServer(() => undefined);
    await open('/no-such-page');
    expect(await screen.findByText('Page Not Found')).toBeTruthy();
    cleanup();
    await signedInAs('auditor');
    await open('/audit/history/nonsense/x');
    expect(await screen.findByText('Page Not Found')).toBeTruthy();
  });

  it('read a list’s search from the address, dropping what does not fit', async () => {
    await signedInAs('admin');
    fakeServer(() => undefined);
    let router = await open(
      '/people/changes?status=approved&q=%20abc%20&page=2',
    );
    // What the page reads: the address checked by the route.
    expect(router.state.matches.at(-1)!.search).toEqual({
      status: 'approved',
      q: 'abc',
      page: 2,
    });
    cleanup();
    router = await open('/people/changes?status=lost&q=%20%20&page=1');
    expect(router.state.matches.at(-1)!.search).toEqual({});
  });

  it('keep someone awaiting verification on the status page, saying as what', async () => {
    await signedInAs('investor');
    fakeServer(() => undefined);
    store.dispatch(
      sessionStarted({
        accessToken: 't',
        tokenType: 'Bearer',
        expiresIn: 900,
        mustChangePassword: false,
        user: { id: 'me', role: 'investor', status: 'pending', language: 'en' },
      }),
    );
    await open('/status');
    expect(await screen.findByText('Registration Under Review')).toBeTruthy();
    expect(screen.getByText('Investor', { selector: 'strong' })).toBeTruthy();
  });
});
