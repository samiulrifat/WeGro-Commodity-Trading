import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { toApiError } from '@/api/errors';
import {
  useAuthDemoAccountsQuery,
  useAuthDemoLoginMutation,
} from '@/api/generated/auth';
import { landingFor, type Role } from '@/app/navigation';
import { ensureSession, SessionUnknownError } from '@/app/session';
import { LanguageSwitch } from '@/components/language-switch';
import { Logo } from '@/components/logo';
import { LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { errorText } from '@/i18n/text';
import { useAppDispatch } from '@/store/hooks';
import { sessionStarted } from '@/store/session-slice';

/** Only paths inside the app: never another site after signing in. */
const internal = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : undefined;

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search): { redirect?: string } => {
    const target = internal(search.redirect);
    return target ? { redirect: target } : {};
  },
  beforeLoad: async ({ context: { store }, search }) => {
    try {
      await ensureSession(store);
    } catch (error) {
      // Offline: still show the page; signing in will say why it fails.
      if (!(error instanceof SessionUnknownError)) throw error;
    }
    const { user } = store.getState().session;
    if (user) throw redirect({ href: landingFor(user, search.redirect) });
  },
  component: SignInPage,
});

function SignInPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Logo className="h-9" />
        <LanguageSwitch />
      </div>
      <div className="grid gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('signIn.title')}
        </h1>
        <p className="text-muted-foreground">{t('signIn.passwordComing')}</p>
      </div>
      <DemoRoles />
    </div>
  );
}

/** Demo mode: one ready-made account per role (the backend refuses otherwise). */
function DemoRoles() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();
  const accounts = useAuthDemoAccountsQuery();
  const [signIn] = useAuthDemoLoginMutation();
  const [busy, setBusy] = useState<Role | null>(null);

  if (accounts.isLoading) return <LoadingState />;
  if (!accounts.data) {
    return <p className="text-muted-foreground">{t('signIn.demoOff')}</p>;
  }

  async function choose(role: Role) {
    setBusy(role);
    try {
      const { data } = await signIn({ demoLoginDto: { role } }).unwrap();
      dispatch(sessionStarted(data));
      await navigate({ href: landingFor(data.user, target) });
    } catch (error) {
      toast.error(errorText(toApiError(error as never)!, i18n));
      setBusy(null);
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="demo-title">
      <div>
        <h2 id="demo-title" className="text-lg font-bold">
          {t('signIn.demoTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('signIn.demoHint')}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {accounts.data.data.map((account) => (
          <li key={account.role}>
            <Button
              variant="outline"
              className="h-auto min-h-14 w-full flex-col items-start gap-0 py-2 text-left"
              disabled={busy !== null}
              onClick={() => void choose(account.role)}
            >
              <span className="font-bold">
                {busy === account.role
                  ? t('signIn.signingIn')
                  : t(`roles.${account.role}`)}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {account.fullName}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
