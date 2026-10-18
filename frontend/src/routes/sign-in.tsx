import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type DemoAccountDto,
  useAuthDemoAccountsQuery,
  useAuthDemoLoginMutation,
  useAuthLoginMutation,
} from '@/api/generated/auth';
import { AuthPage } from '@/app/auth/auth-page';
import { FormError } from '@/app/auth/form-error';
import { internalPath } from '@/app/auth/landing';
import { PasswordInput } from '@/app/auth/password-input';
import { landingFor, type Role } from '@/app/navigation';
import { InstallApp, InstallIcon } from '@/app/pwa/install-app';
import { ensureSession, SessionUnknownError } from '@/app/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorText } from '@/i18n/text';
import { latinDigits } from '@/lib/format';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { sessionStarted } from '@/store/session-slice';

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search): { redirect?: string } => {
    const target = internalPath(search.redirect);
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
  const ended = useAppSelector((s) => s.session.endReason === 'expired');
  // Demo mode only: the backend answers 404 otherwise.
  const demo = useAuthDemoAccountsQuery();
  const form = <PasswordSignIn />;
  return (
    <AuthPage title={t('signIn.title')}>
      {ended && (
        <Alert polite>
          <Info />
          <AlertDescription>{t('signIn.sessionEnded')}</AlertDescription>
        </Alert>
      )}
      {demo.data ? (
        <Tabs defaultValue="password" className="gap-6">
          <TabsList className="w-full">
            <TabsTrigger value="password">{t('signIn.signInTab')}</TabsTrigger>
            <TabsTrigger value="demo">{t('signIn.demoTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="password">{form}</TabsContent>
          <TabsContent value="demo">
            <DemoRoles accounts={demo.data.data} />
          </TabsContent>
        </Tabs>
      ) : (
        form
      )}
      <InstallApp
        render={(open) => (
          <Button variant="outline" className="self-start" onClick={open}>
            <InstallIcon /> {t('pwa.install')}
          </Button>
        )}
      />
    </AuthPage>
  );
}

function useSignedIn() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();
  return async (tokens: Parameters<typeof sessionStarted>[0]) => {
    dispatch(sessionStarted(tokens));
    await navigate({ href: landingFor(tokens.user, target) });
  };
}

/** Phone and password. A temporary password leads on to choosing one's own. */
function PasswordSignIn() {
  const { t } = useTranslation();
  const signedIn = useSignedIn();
  const [login, { isLoading }] = useAuthLoginMutation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const missingPhone = tried && !phone.trim();
  const missingPassword = tried && !password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!phone.trim() || !password) return;
    setError(null);
    try {
      const { data } = await login({
        loginDto: { phone: latinDigits(phone.trim()), password },
      }).unwrap();
      await signedIn(data);
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
      <Field data-invalid={missingPhone || undefined}>
        <FieldLabel htmlFor="sign-in-phone">{t('signIn.phone')}</FieldLabel>
        <Input
          id="sign-in-phone"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          value={phone}
          aria-invalid={missingPhone || undefined}
          onChange={(e) => setPhone(e.target.value)}
        />
        {missingPhone && <FieldError>{t('signIn.phoneRequired')}</FieldError>}
      </Field>
      <Field data-invalid={missingPassword || undefined}>
        <FieldLabel htmlFor="sign-in-password">
          {t('signIn.password')}
        </FieldLabel>
        <PasswordInput
          id="sign-in-password"
          autoComplete="current-password"
          value={password}
          aria-invalid={missingPassword || undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {missingPassword && (
          <FieldError>{t('signIn.passwordRequired')}</FieldError>
        )}
      </Field>
      <FormError error={error} />
      <Button type="submit" size="lg" disabled={isLoading}>
        {isLoading ? t('signIn.signingIn') : t('signIn.submit')}
      </Button>
      <Link
        to="/forgot-password"
        search={phone.trim() ? { phone: phone.trim() } : {}}
        className="justify-self-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t('signIn.forgot')}
      </Link>
    </form>
  );
}

/** Demo mode: one ready-made account per role. */
function DemoRoles({ accounts }: { accounts: DemoAccountDto[] }) {
  const { t, i18n } = useTranslation();
  const signedIn = useSignedIn();
  const [signIn] = useAuthDemoLoginMutation();
  const [busy, setBusy] = useState<Role | null>(null);

  async function choose(role: Role) {
    setBusy(role);
    try {
      const { data } = await signIn({ demoLoginDto: { role } }).unwrap();
      await signedIn(data);
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
        {accounts.map((account) => (
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
