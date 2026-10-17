import { baseApi } from '@/api/base-api';
import { authApi } from '@/api/generated/auth';
import { renewSession } from '@/api/http';
import { sessionEnded } from '@/store/session-slice';
import type { AppStore } from '@/store/store';

/** The server could not be asked whether a session exists (offline, or down). */
export class SessionUnknownError extends Error {
  constructor() {
    super('The session could not be checked');
    this.name = 'SessionUnknownError';
  }
}

/**
 * On a page load the session is unknown until the refresh cookie has been
 * tried once (renewals are shared, so this costs one request at most).
 */
export async function ensureSession(store: AppStore): Promise<void> {
  if (store.getState().session.status !== 'unknown') return;
  await renewSession();
  if (store.getState().session.status === 'unknown') {
    throw new SessionUnknownError();
  }
}

/** Ends this session here and on the server; nothing of it stays on screen. */
export async function signOut(store: AppStore): Promise<void> {
  const request = store.dispatch(authApi.endpoints.authLogout.initiate());
  try {
    await request.unwrap();
  } catch {
    // Offline: the cookie still ends with the session below and expires.
  } finally {
    request.reset();
  }
  store.dispatch(sessionEnded());
  store.dispatch(baseApi.util.resetApiState());
}
