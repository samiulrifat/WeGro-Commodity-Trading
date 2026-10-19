import { createFileRoute, redirect } from '@tanstack/react-router';
import { landingFor } from '@/app/navigation';
import { ensureSession, SessionUnknownError } from '@/app/session';
import { SignUpPage } from '@/features/sign-up/sign-up-page';

/** Investors and buyers signing up themselves; signed-in people go home. */
export const Route = createFileRoute('/register')({
  beforeLoad: async ({ context: { store } }) => {
    try {
      await ensureSession(store);
    } catch (error) {
      // Offline: still show the page; sending will say why it fails.
      if (!(error instanceof SessionUnknownError)) throw error;
    }
    const { user } = store.getState().session;
    if (user) throw redirect({ href: landingFor(user, undefined) });
  },
  component: SignUpPage,
});
