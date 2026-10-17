import { afterEach, describe, expect, it, vi } from 'vitest';

const tokens = {
  accessToken: 't',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
  user: { id: 'u1', role: 'farmer', status: 'verified', language: null },
};

/** A fresh store and session helpers for each case. */
async function start(answer: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(answer));
  vi.resetModules();
  const { store } = await import('@/store/store');
  const session = await import('./session');
  return { store, ...session };
}

describe('session on a page load', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is signed out when there is no session cookie', async () => {
    const { store, ensureSession } = await start(async () =>
      Response.json(
        { statusCode: 401, message: 'x', code: 'SIGN_IN_REQUIRED' },
        { status: 401 },
      ),
    );
    await ensureSession(store);
    expect(store.getState().session.status).toBe('signedOut');
  });

  it('is restored from the cookie', async () => {
    const { store, ensureSession } = await start(async () =>
      Response.json({ data: tokens }),
    );
    await ensureSession(store);
    expect(store.getState().session).toMatchObject({
      status: 'signedIn',
      user: { role: 'farmer' },
    });
  });

  it('says it could not tell when the server cannot be reached, and asks again later', async () => {
    let online = false;
    const { store, ensureSession, SessionUnknownError } = await start(
      async () => {
        if (!online) throw new TypeError('Failed to fetch');
        return Response.json({ data: tokens });
      },
    );
    await expect(ensureSession(store)).rejects.toBeInstanceOf(
      SessionUnknownError,
    );
    expect(store.getState().session.status).toBe('unknown');
    online = true;
    await ensureSession(store);
    expect(store.getState().session.status).toBe('signedIn');
  });

  it('signs out here even when the server cannot be told', async () => {
    const { store, ensureSession, signOut } = await start(async () =>
      Response.json({ data: tokens }),
    );
    await ensureSession(store);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await signOut(store);
    expect(store.getState().session).toMatchObject({
      status: 'signedOut',
      user: null,
      accessToken: null,
    });
  });
});
