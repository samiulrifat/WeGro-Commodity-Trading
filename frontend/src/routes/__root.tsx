import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '@/app/router';
import { NotFoundPage } from '@/app/pages';
import { Logo } from '@/components/logo';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-4 sm:p-6">
      <Logo className="h-8 self-start" />
      <NotFoundPage />
    </div>
  ),
});
