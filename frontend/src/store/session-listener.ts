import { createListenerMiddleware } from '@reduxjs/toolkit';
import { storage } from '@/lib/storage';
import type { RememberedUser } from './session-slice';
import type { AppDispatch, RootState } from './store';

export const LAST_USER_KEY = 'wegro.lastUser';

/**
 * Remembers who is signed in on this device, so the app can open for them
 * without internet (see ensureSession), and forgets them on sign-out.
 */
export const sessionListener = createListenerMiddleware();

sessionListener.startListening.withTypes<RootState, AppDispatch>()({
  predicate: (_action, now, before) => now.session !== before.session,
  effect: (_action, api) => {
    const { status, user, mustChangePassword } = api.getState().session;
    if (status === 'signedIn' && user) {
      const remembered: RememberedUser = { user, mustChangePassword };
      storage.set(LAST_USER_KEY, JSON.stringify(remembered));
    } else if (status === 'signedOut') {
      storage.remove(LAST_USER_KEY);
    }
  },
});
