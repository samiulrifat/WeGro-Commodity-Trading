import { baseApi } from '@/api/base-api';
import { apiUrl, renewSession } from '@/api/http';
import { storage } from '@/lib/storage';
import { LAST_USER_KEY } from '@/store/session-listener';
import {
  type RememberedUser,
  sessionEnded,
  sessionOffline,
} from '@/store/session-slice';
import type { AppStore } from '@/store/store';

/** The server could not be asked whether a session exists (offline, or down). */
export class SessionUnknownError extends Error {
  constructor() {
    super('The session could not be checked');
    this.name = 'SessionUnknownError';
  }
}

/** Signed out while offline: the server must still be told. */
const SIGN_OUT_PENDING = 'wegro.signOutPending';

function remembered(): RememberedUser | null {
  try {
    const value = JSON.parse(
      storage.get(LAST_USER_KEY) ?? 'null',
    ) as RememberedUser | null;
    return value?.user?.id && value.user.role ? value : null;
  } catch {
    return null;
  }
}

/** Ends the session on the server; false when it cannot be reached. */
async function tellServer(): Promise<boolean> {
  try {
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'same-origin',
    });
    storage.remove(SIGN_OUT_PENDING);
    return true;
  } catch {
    storage.set(SIGN_OUT_PENDING, '1');
    return false;
  }
}

/**
 * On a page load the session is unknown until the refresh cookie has been
 * tried once (renewals are shared, so this costs one request at most).
 * Without a connection the app opens for the person who last signed in on
 * this device ("offline"), or, if nobody is, says so.
 */
export async function ensureSession(store: AppStore): Promise<void> {
  if (store.getState().session.status !== 'unknown') return;
  if (storage.get(SIGN_OUT_PENDING)) {
    // A sign-out made offline is finished before anything else.
    await tellServer();
    store.dispatch(sessionEnded());
    return;
  }
  await renewSession();
  if (store.getState().session.status !== 'unknown') return;
  const last = remembered();
  if (!last) throw new SessionUnknownError();
  store.dispatch(sessionOffline(last));
}

/**
 * While open offline, reconnects to the real session as soon as the device
 * is online again (or the app comes back to the foreground).
 */
export function watchConnection(store: AppStore): void {
  const reconnect = () => {
    if (!navigator.onLine) return;
    if (storage.get(SIGN_OUT_PENDING)) void tellServer();
    else if (store.getState().session.status === 'offline') {
      void renewSession();
    }
  };
  window.addEventListener('online', reconnect);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnect();
  });
}

/**
 * Ends this session here and on the server; nothing of it stays on screen.
 * Offline, the server is told the next time the device is online.
 */
export async function signOut(store: AppStore): Promise<void> {
  await tellServer();
  store.dispatch(sessionEnded());
  store.dispatch(baseApi.util.resetApiState());
}
