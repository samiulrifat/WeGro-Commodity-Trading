import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import { useAuthChangePasswordMutation } from '@/api/generated/auth';
import { AuthPage } from '@/app/auth/auth-page';
import { FormError } from '@/app/auth/form-error';
import { NewPasswordFields } from '@/app/auth/new-password-fields';
import {
  type NewPassword,
  newPasswordProblem,
} from '@/app/auth/password-rules';
import { PasswordInput } from '@/app/auth/password-input';
import { landingFor } from '@/app/navigation';
import { ensureSession, signOut } from '@/app/session';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { useAppDispatch } from '@/store/hooks';
import { sessionStarted } from '@/store/session-slice';
import { store } from '@/store/store';

/** A temporary password allows nothing else until it is changed. */
export const Route = createFileRoute('/change-password')({
  beforeLoad: async ({ context }) => {
    await ensureSession(context.store);
    const session = context.store.getState().session;
    if (!session.user) throw redirect({ to: '/sign-in' });
    if (!session.mustChangePassword) throw redirect({ to: '/' });
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [change, changing] = useAuthChangePasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState<NewPassword>({ value: '', again: '' });
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
      // Every older session ended; this one starts afresh.
      dispatch(sessionStarted(data));
      await navigate({ href: landingFor(data.user, undefined) });
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <AuthPage
      title={t('changePassword.title')}
      intro={t('changePassword.hint')}
    >
      <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
        <Field data-invalid={missingCurrent || undefined}>
          <FieldLabel htmlFor="change-current">
            {t('changePassword.current')}
          </FieldLabel>
          <PasswordInput
            id="change-current"
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
          idPrefix="change"
          value={next}
          onChange={setNext}
          showProblems={tried}
        />
        <FormError error={error} />
        <Button type="submit" size="lg" disabled={changing.isLoading}>
          {changing.isLoading
            ? t('changePassword.saving')
            : t('changePassword.save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() =>
            void signOut(store).then(() => navigate({ to: '/sign-in' }))
          }
        >
          {t('shell.signOut')}
        </Button>
      </form>
    </AuthPage>
  );
}
