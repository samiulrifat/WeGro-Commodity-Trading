import { createFileRoute, redirect } from '@tanstack/react-router';
import { access } from '@/app/navigation';
import { ensureSession, SessionUnknownError } from '@/app/session';
import { AppShell } from '@/app/shell/app-shell';

/** Every signed-in page: the session is checked before anything loads. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context: { store }, location }) => {
    try {
      await ensureSession(store);
    } catch (error) {
      // No connection and nobody signed in here before: the sign-in page.
      if (!(error instanceof SessionUnknownError)) throw error;
    }
    const result = access(store.getState().session);
    if (result === 'sign-in') {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    }
    if (result === 'change-password')
      throw redirect({ to: '/change-password' });
  },
  component: AppShell,
});
