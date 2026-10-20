import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { vi } from 'vitest';
import { baseApi } from '@/api/base-api';
import type { TokenResponseDto } from '@/api/generated/auth';
import type { Role } from '@/app/navigation';
import { applyLanguage, initI18n } from '@/i18n';
import { sessionStarted } from '@/store/session-slice';
import { store } from '@/store/store';

/** A request the page made: method, path with query, and body. */
export interface Sent {
  method: string;
  url: URL;
  body: unknown;
}

/**
 * Answers the page's API requests from `answer` (by method and path) and
 * records them. An answer of `undefined` is a 404.
 */
export function fakeServer(
  answer: (sent: Sent) => { status?: number; body: unknown } | undefined,
) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      // Multipart forms (uploads) as their fields, file names for files.
      const multipart = (request.headers.get('content-type') ?? '').startsWith(
        'multipart/form-data',
      );
      let body: unknown;
      if (multipart) {
        const form = await request.clone().formData();
        const fields: Record<string, string[]> = {};
        form.forEach((v, k) => {
          (fields[k] ??= []).push(typeof v === 'string' ? v : v.name);
        });
        body = fields;
      } else {
        const text = await request.clone().text();
        try {
          body = text ? (JSON.parse(text) as unknown) : undefined;
        } catch {
          // jsdom's FormData does not serialise into a Request: kept as sent.
          body = text;
        }
      }
      const entry = { method: request.method, url: new URL(request.url), body };
      sent.push(entry);
      const reply = answer(entry) ?? {
        status: 404,
        body: { code: 'NOT_FOUND' },
      };
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return sent;
}

/** Signs `role` in (verified), in English, with nothing cached. */
export async function signedInAs(role: Role) {
  await initI18n('en');
  await applyLanguage('en');
  store.dispatch(baseApi.util.resetApiState());
  const tokens: TokenResponseDto = {
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    mustChangePassword: false,
    user: { id: 'me', role, status: 'verified', language: 'en' },
  };
  store.dispatch(sessionStarted(tokens));
}

/**
 * Renders `page` at `path` with the app's store, inside a router whose
 * other addresses are empty pages, so links and navigation work.
 */
export async function renderPage(page: ReactNode, path: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const pathname = path.split('?')[0]!;
  const here = createRoute({
    getParentRoute: () => root,
    path: pathname,
    validateSearch: (s: Record<string, unknown>) => s,
    component: () => <>{page}</>,
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: '$',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([here, other]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const view = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { ...view, router };
}
