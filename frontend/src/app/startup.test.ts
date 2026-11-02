// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '@/store/store';
import { store } from '@/store/store';
import { fakeServer, signedInAs } from '@/test/render';
import { startEarly } from './startup';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const at = (path: string) => window.history.replaceState(null, '', path);
const asked = (sent: { url: URL }[]) => sent.map((s) => s.url.pathname);

describe('starting up', () => {
  it('asks for what every signed-in page shows, side by side', async () => {
    await signedInAs('admin');
    const sent = fakeServer(() => undefined);
    at('/projects');
    startEarly(store);
    await vi.waitFor(() =>
      expect(asked(sent).sort()).toEqual([
        '/api/auth/me',
        '/api/catalog',
        '/api/notifications/unread-count',
      ]),
    );
  });

  it('asks for nothing on pages anyone opens', async () => {
    await signedInAs('admin');
    const sent = fakeServer(() => undefined);
    at('/sign-in');
    startEarly(store);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
  });

  it('leaves it to the page when nobody is signed in, or the session cannot be checked', async () => {
    const sent = fakeServer(() => undefined);
    at('/projects');
    const signedOut = {
      getState: () => ({ session: { status: 'signedOut' } }),
      dispatch: vi.fn(),
    } as unknown as AppStore;
    startEarly(signedOut);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);

    localStorage.clear();
    const unknown = {
      getState: () => ({ session: { status: 'unknown' } }),
      dispatch: vi.fn(),
    } as unknown as AppStore;
    startEarly(unknown);
    await vi.waitFor(() => expect(asked(sent)).toEqual(['/api/auth/refresh']));
    expect(unknown.dispatch).not.toHaveBeenCalled();
  });
});
