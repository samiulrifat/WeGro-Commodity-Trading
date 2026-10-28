import { authApi } from '@/api/generated/auth';
import { catalogApi } from '@/api/generated/catalog';
import { notificationsApi } from '@/api/generated/notifications';
import type { AppStore } from '@/store/store';
import { router } from './router';
import { ensureSession } from './session';

/** Pages anyone opens without signing in: no session to look for. */
const PUBLIC = /^\/(sign-in|register|forgot-password|verify\/|design)/;

/**
 * At start-up, what the first page will need is fetched at once and side by
 * side, not one after another: the session is renewed while the page's code
 * loads, and once signed in, the frame's data (who you are, the unread
 * count, the catalog) is asked for while the page draws. On a phone on 4G
 * each step skipped is a round trip saved.
 */
export function startEarly(store: AppStore): void {
  const path = window.location.pathname;
  for (const match of router.matchRoutes(path)) {
    void router.loadRouteChunk(
      router.routesById[match.routeId as keyof typeof router.routesById],
    );
  }
  if (PUBLIC.test(path)) return;
  void ensureSession(store)
    .then(() => {
      if (store.getState().session.status !== 'signedIn') return;
      store.dispatch(authApi.util.prefetch('authMe', undefined, {}));
      store.dispatch(
        notificationsApi.util.prefetch('notificationsUnread', undefined, {}),
      );
      store.dispatch(catalogApi.util.prefetch('catalogGet', {}, {}));
    })
    // The page guard asks again and shows what went wrong.
    .catch(() => undefined);
}
