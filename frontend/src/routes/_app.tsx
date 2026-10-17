import { createFileRoute, redirect } from '@tanstack/react-router';
import { access } from '@/app/navigation';
import { ensureSession } from '@/app/session';
import { AppShell } from '@/app/shell/app-shell';

/** Every signed-in page: the session is checked before anything loads. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context: { store }, location }) => {
    await ensureSession(store);
    const result = access(store.getState().session);
    if (result === 'sign-in') {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    }
    if (result === 'change-password')
      throw redirect({ to: '/change-password' });
  },
  component: AppShell,
});
