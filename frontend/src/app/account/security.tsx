import { useNavigate } from '@tanstack/react-router';
import { Copy, LogOut } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  useAuthChangePasswordMutation,
  useAuthLogoutAllMutation,
  useAuthMeQuery,
} from '@/api/generated/auth';
import { FormError } from '@/app/auth/form-error';
import { NewPasswordFields } from '@/app/auth/new-password-fields';
import {
  type NewPassword,
  newPasswordProblem,
} from '@/app/auth/password-rules';
import { PasswordInput } from '@/app/auth/password-input';
import { forgetSession } from '@/app/session';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { errorText } from '@/i18n/text';
import { useAppDispatch } from '@/store/hooks';
import { sessionStarted } from '@/store/session-slice';
import { store } from '@/store/store';

const EMPTY: NewPassword = { value: '', again: '' };

/** A new password; every other device is signed out, this one goes on. */
export function PasswordCard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [change, changing] = useAuthChangePasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState<NewPassword>(EMPTY);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const missingCurrent = tried && !current;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!current || newPasswordProblem(next)) return;
    setError(null);
    try {
      const { data } = await change({
        changePasswordDto: {
          currentPassword: current,
          newPassword: next.value,
        },
      }).unwrap();
      dispatch(sessionStarted(data));
      setCurrent('');
      setNext(EMPTY);
      setTried(false);
      toast.success(t('account.password.changed'));
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('account.password.title')}</CardTitle>
        <CardDescription>{t('account.password.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={missingCurrent || undefined}>
            <FieldLabel htmlFor="account-current">
              {t('account.password.current')}
            </FieldLabel>
            <PasswordInput
              id="account-current"
              autoComplete="current-password"
              value={current}
              aria-invalid={missingCurrent || undefined}
              onChange={(e) => setCurrent(e.target.value)}
            />
            {missingCurrent && (
              <FieldError>{t('signIn.passwordRequired')}</FieldError>
            )}
          </Field>
          <NewPasswordFields
            idPrefix="account"
            value={next}
            onChange={setNext}
            showProblems={tried}
          />
          <FormError error={error} />
          <Button
            type="submit"
            className="justify-self-start"
            disabled={changing.isLoading}
          >
            {changing.isLoading
              ? t('account.password.saving')
              : t('account.password.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Staff only: the address that signs their actions on the ledger. */
export function LedgerAccountCard() {
  const { t } = useTranslation();
  const account = useAuthMeQuery().data?.data.account;
  if (!account) return null;

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      toast.success(t('account.ledger.copied'));
    } catch {
      // No clipboard (an insecure page, or refused): the address stays selectable.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('account.ledger.title')}</CardTitle>
        <CardDescription>{t('account.ledger.intro')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all select-all">
          {account}
        </code>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => void copy(account)}
        >
          <Copy /> {t('account.ledger.copy')}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Ends every session of the person, here too, after asking. */
export function SignOutEverywhereCard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [logoutAll, working] = useAuthLogoutAllMutation();

  async function signOutEverywhere() {
    try {
      await logoutAll().unwrap();
      forgetSession(store);
      await navigate({ to: '/sign-in' });
    } catch (e) {
      toast.error(errorText(toApiError(e as never)!, i18n));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('account.everywhere.title')}
        </CardTitle>
        <CardDescription>{t('account.everywhere.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <LogOut /> {t('account.everywhere.action')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('account.everywhere.confirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('account.everywhere.confirmText')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('account.everywhere.cancel')}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={working.isLoading}
                onClick={() => void signOutEverywhere()}
              >
                {working.isLoading
                  ? t('account.everywhere.working')
                  : t('account.everywhere.action')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
