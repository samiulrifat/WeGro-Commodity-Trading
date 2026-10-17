import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ensureSession, signOut } from '@/app/session';
import { Logo } from '@/components/logo';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { store } from '@/store/store';

/** A temporary password allows nothing else until it is changed. */
export const Route = createFileRoute('/change-password')({
  beforeLoad: async ({ context }) => {
    await ensureSession(context.store);
    const session = context.store.getState().session;
    if (session.status !== 'signedIn') throw redirect({ to: '/sign-in' });
    if (!session.mustChangePassword) throw redirect({ to: '/' });
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-4 sm:p-6">
      <Logo className="h-9 self-start" />
      <EmptyState
        icon={KeyRound}
        title={t('changePassword.title')}
        description={t('changePassword.hint')}
        action={
          <Button
            variant="outline"
            onClick={() =>
              void signOut(store).then(() => navigate({ to: '/sign-in' }))
            }
          >
            {t('shell.signOut')}
          </Button>
        }
      />
    </div>
  );
}
