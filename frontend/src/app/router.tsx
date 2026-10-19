import { createRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { type AppStore, store } from '@/store/store';
import type { Area, SubPath } from './navigation';
import { NotFoundPage, PageError, PageLoading } from './pages';

/** What every route's guards can read. */
export interface RouterContext {
  store: AppStore;
}

export const router = createRouter({
  routeTree,
  context: { store },
  // Start loading a page's code when a link is pointed at or touched.
  defaultPreload: 'intent',
  defaultPendingComponent: PageLoading,
  defaultErrorComponent: PageError,
  defaultNotFoundComponent: NotFoundPage,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** The area a page belongs to: who may open it (see navigation.ts). */
    area?: Area;
    /** One of its section's pages: only roles with that page may open it. */
    page?: SubPath;
  }
}
