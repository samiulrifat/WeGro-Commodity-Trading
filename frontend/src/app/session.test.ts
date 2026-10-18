import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tokens = {
  accessToken: 't',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
  user: { id: 'u1', role: 'field_officer', status: 'verified', language: null },
};

const refused = () =>
  Response.json(
    { statusCode: 401, message: 'x', code: 'SIGN_IN_REQUIRED' },
    { status: 401 },
  );
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

let saved: Map<string, string>;
let calls: string[];
let answer: (path: string) => Promise<Response>;

/** A fresh store and session helpers; the network answers via `answer`. */
async function start() {
  vi.resetModules();
  const { store } = await import('@/store/store');
  const session = await import('./session');
  return { store, ...session };
}

describe('session', () => {
  beforeEach(() => {
    saved = new Map();
    calls = [];
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => saved.set(k, v),
      removeItem: (k: string) => saved.delete(k),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: Request | string) => {
        const path = new URL(
          typeof input === 'string' ? input : input.url,
          'http://localhost',
        ).pathname;
        calls.push(path);
        return answer(path);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is signed out when there is no session cookie, with nothing to explain', async () => {
    answer = async () => refused();
    const { store, ensureSession } = await start();
    await ensureSession(store);
    expect(store.getState().session).toMatchObject({
      status: 'signedOut',
      endReason: null,
    });
  });

  it('says a session expired when it is refused while open', async () => {
    answer = async () => Response.json({ data: tokens });
    const { store, ensureSession } = await start();
    await ensureSession(store);
    const { renewSession } = await import('@/api/http');
    answer = async () => refused();
    await renewSession();
    expect(store.getState().session).toMatchObject({
      status: 'signedOut',
      endReason: 'expired',
    });
  });

  it('marks a chosen sign-out as such', async () => {
    answer = async () => Response.json({ data: tokens });
    const { store, ensureSession, signOut } = await start();
    await ensureSession(store);
    answer = async () => new Response(null, { status: 204 });
    await signOut(store);
    expect(store.getState().session.endReason).toBe('signedOut');
  });

  it('is restored from the cookie, and remembered on this device', async () => {
    answer = async () => Response.json({ data: tokens });
    const { store, ensureSession } = await start();
    await ensureSession(store);
    expect(store.getState().session).toMatchObject({
      status: 'signedIn',
      user: { role: 'field_officer' },
    });
    expect(JSON.parse(saved.get('wegro.lastUser')!)).toEqual({
      user: tokens.user,
      mustChangePassword: false,
    });
  });

  it('says it could not tell when offline and nobody signed in here before', async () => {
    answer = offline;
    const { store, ensureSession, SessionUnknownError } = await start();
    await expect(ensureSession(store)).rejects.toBeInstanceOf(
      SessionUnknownError,
    );
    expect(store.getState().session.status).toBe('unknown');
  });

  it('opens offline for the last person signed in here, without a token', async () => {
    saved.set(
      'wegro.lastUser',
      JSON.stringify({ user: tokens.user, mustChangePassword: false }),
    );
    answer = offline;
    const { store, ensureSession } = await start();
    await ensureSession(store);
    expect(store.getState().session).toEqual({
      status: 'offline',
      accessToken: null,
      user: tokens.user,
      mustChangePassword: false,
      endReason: null,
    });
  });

  it('reconnects to the real session once online again', async () => {
    saved.set(
      'wegro.lastUser',
      JSON.stringify({ user: tokens.user, mustChangePassword: false }),
    );
    answer = offline;
    const { store, ensureSession, watchConnection } = await start();
    await ensureSession(store);
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('window', {
      addEventListener: (name: string, fn: () => void) =>
        (listeners[name] = fn),
    });
    vi.stubGlobal('document', { addEventListener: () => {} });
    vi.stubGlobal('navigator', { onLine: true });
    watchConnection(store);
    answer = async () => Response.json({ data: tokens });
    listeners.online!();
    await vi.waitFor(() =>
      expect(store.getState().session).toMatchObject({
        status: 'signedIn',
        accessToken: 't',
      }),
    );
  });

  it('signs out properly when the server refuses on reconnecting', async () => {
    saved.set(
      'wegro.lastUser',
      JSON.stringify({ user: tokens.user, mustChangePassword: false }),
    );
    answer = offline;
    const { store, ensureSession, watchConnection } = await start();
    await ensureSession(store);
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('window', {
      addEventListener: (name: string, fn: () => void) =>
        (listeners[name] = fn),
    });
    vi.stubGlobal('document', { addEventListener: () => {} });
    vi.stubGlobal('navigator', { onLine: true });
    watchConnection(store);
    answer = async () => refused();
    listeners.online!();
    await vi.waitFor(() =>
      expect(store.getState().session.status).toBe('signedOut'),
    );
    expect(saved.has('wegro.lastUser')).toBe(false);
  });

  it('finishes a sign-out made offline before anything else, next time online', async () => {
    answer = async () => Response.json({ data: tokens });
    const { store, ensureSession, signOut } = await start();
    await ensureSession(store);
    answer = offline;
    await signOut(store);
    expect(store.getState().session).toMatchObject({
      status: 'signedOut',
      user: null,
    });
    expect(saved.has('wegro.lastUser')).toBe(false);
    expect(saved.get('wegro.signOutPending')).toBe('1');

    // Next page load, online: the cookie must not sign them back in.
    calls = [];
    answer = async (path) =>
      path.endsWith('/logout')
        ? new Response(null, { status: 204 })
        : Response.json({ data: tokens });
    const next = await start();
    await next.ensureSession(next.store);
    expect(calls).toEqual(['/api/auth/logout']);
    expect(next.store.getState().session.status).toBe('signedOut');
    expect(saved.has('wegro.signOutPending')).toBe(false);
  });
});
