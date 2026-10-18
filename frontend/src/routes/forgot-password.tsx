import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  useAuthCompleteResetMutation,
  useAuthRequestResetMutation,
  useAuthVerifyResetMutation,
} from '@/api/generated/auth';
import { AuthPage } from '@/app/auth/auth-page';
import { FormError } from '@/app/auth/form-error';
import { NewPasswordFields } from '@/app/auth/new-password-fields';
import {
  type NewPassword,
  newPasswordProblem,
} from '@/app/auth/password-rules';
import { landingFor } from '@/app/navigation';
import { ensureSession, SessionUnknownError } from '@/app/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { latinDigits } from '@/lib/format';
import { useAppDispatch } from '@/store/hooks';
import { sessionStarted } from '@/store/session-slice';

export const Route = createFileRoute('/forgot-password')({
  validateSearch: (search): { phone?: string } =>
    typeof search.phone === 'string' && search.phone.length <= 32
      ? { phone: search.phone }
      : {},
  beforeLoad: async ({ context: { store } }) => {
    try {
      await ensureSession(store);
    } catch (error) {
      if (!(error instanceof SessionUnknownError)) throw error;
    }
    const { user } = store.getState().session;
    if (user) throw redirect({ href: landingFor(user, undefined) });
  },
  component: ForgotPasswordPage,
});

type Step =
  | { name: 'phone' }
  | { name: 'code'; phone: string; resendAt: number; minutes: number }
  | { name: 'password'; phone: string; code: string };

const linkClass =
  'justify-self-start text-sm font-semibold text-primary underline-offset-4 hover:underline';

/**
 * A forgotten password, in three steps: the number, the code sent to it by
 * SMS, a new password. It ends signed in, every other device signed out.
 */
function ForgotPasswordPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [phone, setPhone] = useState(search.phone ?? '');
  const [error, setError] = useState<ApiError | null>(null);
  const [request, requesting] = useAuthRequestResetMutation();

  /** Asks for a code; on to the code step, or the reason it was refused. */
  async function sendCode(number: string) {
    setError(null);
    try {
      const { data } = await request({
        passwordResetRequestDto: { phone: number },
      }).unwrap();
      setStep({
        name: 'code',
        phone: number,
        resendAt: Date.now() + data.resendAfterSeconds * 1000,
        minutes: Math.round(data.expiresInSeconds / 60),
      });
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <AuthPage
      title={t('forgot.title')}
      intro={step.name === 'phone' ? t('forgot.phoneIntro') : undefined}
    >
      {step.name === 'phone' && (
        <PhoneStep
          phone={phone}
          onPhone={setPhone}
          busy={requesting.isLoading}
          error={error}
          onSend={(n) => void sendCode(n)}
        />
      )}
      {step.name === 'code' && (
        <CodeStep
          step={step}
          sendError={error}
          resending={requesting.isLoading}
          onResend={() => void sendCode(step.phone)}
          onOtherNumber={() => {
            setError(null);
            setStep({ name: 'phone' });
          }}
          onValid={(code) => {
            setError(null);
            setStep({ name: 'password', phone: step.phone, code });
          }}
        />
      )}
      {step.name === 'password' && (
        <PasswordStep
          step={step}
          onCodeGone={(gone) => {
            setError(gone);
            setStep({
              name: 'code',
              phone: step.phone,
              resendAt: 0,
              minutes: 10,
            });
          }}
        />
      )}
      <Link to="/sign-in" className={linkClass}>
        {t('forgot.back')}
      </Link>
    </AuthPage>
  );
}

function PhoneStep({
  phone,
  onPhone,
  busy,
  error,
  onSend,
}: {
  phone: string;
  onPhone: (v: string) => void;
  busy: boolean;
  error: ApiError | null;
  onSend: (phone: string) => void;
}) {
  const { t } = useTranslation();
  const [tried, setTried] = useState(false);
  const missing = tried && !phone.trim();
  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (phone.trim()) onSend(latinDigits(phone.trim()));
  }
  return (
    <form noValidate onSubmit={submit} className="grid gap-5">
      <Field data-invalid={missing || undefined}>
        <FieldLabel htmlFor="reset-phone">{t('signIn.phone')}</FieldLabel>
        <Input
          id="reset-phone"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          value={phone}
          aria-invalid={missing || undefined}
          onChange={(e) => onPhone(e.target.value)}
        />
        {missing && <FieldError>{t('signIn.phoneRequired')}</FieldError>}
      </Field>
      <FormError error={error} />
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t('forgot.sending') : t('forgot.send')}
      </Button>
    </form>
  );
}

/** Seconds left until `at`, ticking. */
function useSecondsUntil(at: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (at <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [at]);
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function CodeStep({
  step,
  sendError,
  resending,
  onResend,
  onOtherNumber,
  onValid,
}: {
  step: Extract<Step, { name: 'code' }>;
  sendError: ApiError | null;
  resending: boolean;
  onResend: () => void;
  onOtherNumber: () => void;
  onValid: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [verify, verifying] = useAuthVerifyResetMutation();
  const wait = useSecondsUntil(step.resendAt);
  const digits = latinDigits(code.trim());
  const malformed = tried && !/^\d{6}$/.test(digits);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!/^\d{6}$/.test(digits)) return;
    setError(null);
    try {
      await verify({
        passwordResetVerifyDto: { phone: step.phone, code: digits },
      }).unwrap();
      onValid(digits);
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
      {step.resendAt > 0 && (
        <Alert polite>
          <AlertDescription>
            {t('forgot.sent', { minutes: step.minutes })}
          </AlertDescription>
        </Alert>
      )}
      <Field data-invalid={malformed || undefined}>
        <FieldLabel htmlFor="reset-code">{t('forgot.code')}</FieldLabel>
        <Input
          id="reset-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          aria-invalid={malformed || undefined}
          className="text-lg tracking-[0.3em]"
          onChange={(e) => setCode(e.target.value)}
        />
        {malformed && <FieldError>{t('forgot.codeRequired')}</FieldError>}
      </Field>
      <FormError error={error ?? sendError} />
      <Button type="submit" size="lg" disabled={verifying.isLoading}>
        {verifying.isLoading ? t('forgot.checking') : t('forgot.check')}
      </Button>
      <div className="grid gap-2 text-sm">
        {wait > 0 ? (
          <p className="text-muted-foreground">
            {t('forgot.resendIn', { seconds: wait })}
          </p>
        ) : (
          <button
            type="button"
            className={linkClass}
            disabled={resending}
            onClick={() => {
              setError(null);
              onResend();
            }}
          >
            {t('forgot.resend')}
          </button>
        )}
        <button type="button" className={linkClass} onClick={onOtherNumber}>
          {t('forgot.otherNumber')}
        </button>
      </div>
    </form>
  );
}

function PasswordStep({
  step,
  onCodeGone,
}: {
  step: Extract<Step, { name: 'password' }>;
  onCodeGone: (error: ApiError) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [complete, completing] = useAuthCompleteResetMutation();
  const [next, setNext] = useState<NewPassword>({ value: '', again: '' });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (newPasswordProblem(next)) return;
    setError(null);
    try {
      const { data } = await complete({
        passwordResetCompleteDto: {
          phone: step.phone,
          code: step.code,
          newPassword: next.value,
        },
      }).unwrap();
      dispatch(sessionStarted(data));
      await navigate({ href: landingFor(data.user, undefined) });
    } catch (e) {
      const failure = toApiError(e as never)!;
      // The code stopped working meanwhile: back to asking for one.
      if (failure.code === 'RESET_CODE_EXPIRED') onCodeGone(failure);
      else setError(failure);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
      <p className="text-muted-foreground">{t('forgot.newIntro')}</p>
      <NewPasswordFields
        idPrefix="reset"
        value={next}
        onChange={setNext}
        showProblems={tried}
      />
      <FormError error={error} />
      <Button type="submit" size="lg" disabled={completing.isLoading}>
        {completing.isLoading ? t('forgot.saving') : t('forgot.save')}
      </Button>
    </form>
  );
}
