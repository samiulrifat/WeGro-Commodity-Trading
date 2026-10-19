import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleCheck,
  HandCoins,
  ShoppingBasket,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type SignUpDto,
  type TokenResponseDto,
  useAuthConfirmEmailMutation,
  useAuthRequestEmailCodeMutation,
  useSignUpCreateMutation,
  useSignUpRequestCodeMutation,
} from '@/api/generated/auth';
import type { DetailField } from '@/api/generated/participants';
import { AuthPage } from '@/app/auth/auth-page';
import { FormError } from '@/app/auth/form-error';
import { NewPasswordFields } from '@/app/auth/new-password-fields';
import {
  type NewPassword,
  newPasswordProblem,
} from '@/app/auth/password-rules';
import { landingFor } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { problemsOf } from '@/features/people/id-check-text';
import {
  EMPTY_PERSON,
  localPhone,
  missingFields,
  type IdCheck,
  type PersonDraft,
  personRequest,
} from '@/features/people/person';
import { PersonFields } from '@/features/people/person-fields';
import { ConfirmCodeBox } from '@/features/people/phone-code';
import { useConfirmCode } from '@/features/people/use-confirm-code';
import { isLanguage } from '@/i18n/languages';
import { cn } from '@/lib/utils';
import { useAppDispatch } from '@/store/hooks';
import { sessionStarted } from '@/store/session-slice';

type Role = SignUpDto['role'];
type Step = 'role' | 'phone' | 'details' | 'password' | 'email';
const STEPS: readonly Step[] = ['role', 'phone', 'details', 'password'];
const DETAILS: readonly DetailField[] = [
  'fullName',
  'nid',
  'dateOfBirth',
  'district',
  'address',
];
const ROLES: ReadonlyArray<{ role: Role; icon: typeof HandCoins }> = [
  { role: 'investor', icon: HandCoins },
  { role: 'buyer', icon: ShoppingBasket },
];

/**
 * Signing up as an investor or buyer, in steps: who they are, their number
 * (confirmed by an SMS code), their details, their password and, if they
 * like, an email address. They are registered and verified at once and
 * signed in; an email given is then confirmed by a code (or later, in My
 * account). Every other role is registered for them by WeGro.
 */
export function SignUpPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const language = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : 'en';

  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [person, setPerson] = useState<PersonDraft>(EMPTY_PERSON);
  const [password, setPassword] = useState<NewPassword>({
    value: '',
    again: '',
  });
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [problems, setProblems] = useState<
    Partial<Record<DetailField, string>>
  >({});
  const [signedIn, setSignedIn] = useState<TokenResponseDto | null>(null);

  const [requestPhoneCode] = useSignUpRequestCodeMutation();
  const phoneCode = useConfirmCode(
    async (phone) =>
      (
        await requestPhoneCode({
          signUpCodeRequestDto: { phone, language },
        }).unwrap()
      ).data,
  );
  const [create, creating] = useSignUpCreateMutation();
  const phone = localPhone(person.phone);

  function go(next: Step) {
    setTried(false);
    setError(null);
    setStep(next);
  }

  function nextFromPhone(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!phone || phoneCode.problem(phone)) return;
    go('details');
  }

  function nextFromDetails(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (missingFields(person, DETAILS).length > 0) return;
    setProblems({});
    go('password');
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (newPasswordProblem(password)) return;
    setError(null);
    try {
      const { data } = await create({
        signUpDto: {
          ...personRequest(person),
          role: role!,
          phoneCode: phoneCode.digits,
          password: password.value,
          language,
        },
      }).unwrap();
      dispatch(sessionStarted(data));
      if (email.trim()) {
        setSignedIn(data);
        go('email');
      } else {
        await navigate({ href: landingFor(data.user, undefined) });
      }
    } catch (e) {
      const failure = toApiError(e as never)!;
      // Back to the step the refusal is about.
      if (failure.code?.startsWith('CODE_')) {
        phoneCode.setError(failure);
        go('phone');
      } else if (failure.code === 'PHONE_ALREADY_REGISTERED') {
        setError(failure);
        setStep('phone');
      } else if (failure.code === 'ID_CHECK_FAILED') {
        const checks = (failure.details?.checks ?? []) as IdCheck[];
        setProblems(problemsOf(checks, t));
        setError(failure);
        setStep('details');
      } else if (failure.code === 'NID_ALREADY_REGISTERED') {
        setProblems({ nid: t('errors.code.NID_ALREADY_REGISTERED') });
        setStep('details');
      } else {
        setError(failure);
      }
    }
  }

  const index = STEPS.indexOf(step);
  return (
    <AuthPage
      wide
      title={step === 'email' ? t('signUp.emailTitle') : t('signUp.title')}
      intro={
        index >= 0
          ? t('signUp.step', { n: index + 1, of: STEPS.length })
          : undefined
      }
    >
      {index >= 0 && <Progress at={index} />}

      {step === 'role' && (
        <div className="grid gap-5">
          <fieldset className="grid gap-3">
            <legend className="mb-3 font-medium">
              {t('signUp.roleTitle')}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map(({ role: r, icon: Icon }) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={cn(
                    'relative grid gap-1 rounded-lg border p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    role === r
                      ? 'border-ink bg-nav-active/40 ring-1 ring-ink'
                      : 'hover:bg-muted',
                  )}
                >
                  {role === r && (
                    <CircleCheck
                      aria-hidden
                      className="absolute top-3 right-3 size-5 text-ink"
                    />
                  )}
                  <Icon aria-hidden className="size-6 text-brand" />
                  <span className="font-semibold">{t(`roles.${r}`)}</span>
                  <span className="text-sm text-muted-foreground">
                    {t(`signUp.roleHint.${r}`)}
                  </span>
                </button>
              ))}
            </div>
            <FieldDescription>{t('signUp.otherRoles')}</FieldDescription>
          </fieldset>
          <Nav
            onNext={() => role && go('phone')}
            nextDisabled={!role}
            back={<BackToSignIn />}
          />
        </div>
      )}

      {step === 'phone' && (
        <form noValidate onSubmit={nextFromPhone} className="grid gap-5">
          <Field data-invalid={(tried && !phone) || undefined}>
            <FieldLabel htmlFor="sign-up-phone">{t('person.phone')}</FieldLabel>
            <Input
              id="sign-up-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={person.phone}
              aria-invalid={(tried && !phone) || undefined}
              onChange={(e) => setPerson({ ...person, phone: e.target.value })}
            />
            {tried && !phone && (
              <FieldError>{t('signIn.phoneRequired')}</FieldError>
            )}
          </Field>
          {phone && (
            <ConfirmCodeBox
              idPrefix="sign-up"
              to={phone}
              shown={phone}
              confirm={phoneCode}
              showProblem={tried}
              needed={t('signUp.phoneNeeded')}
            />
          )}
          <FormError error={error} />
          <Nav submit onBack={() => go('role')} />
        </form>
      )}

      {step === 'details' && (
        <form noValidate onSubmit={nextFromDetails} className="grid gap-5">
          <p className="text-sm text-muted-foreground">
            {t('signUp.detailsIntro')}
          </p>
          <PersonFields
            idPrefix="sign-up"
            value={person}
            onChange={(next) => {
              setPerson(next);
              setProblems({});
            }}
            fields={DETAILS}
            problems={{
              ...problems,
              ...Object.fromEntries(
                (tried ? missingFields(person, DETAILS) : []).map((f) => [
                  f,
                  t('person.required'),
                ]),
              ),
            }}
          />
          <FormError error={error} />
          <Nav submit onBack={() => go('phone')} />
        </form>
      )}

      {step === 'password' && (
        <form
          noValidate
          onSubmit={(e) => void finish(e)}
          className="grid gap-5"
        >
          <NewPasswordFields
            idPrefix="sign-up"
            value={password}
            onChange={setPassword}
            showProblems={tried}
          />
          <Field>
            <FieldLabel htmlFor="sign-up-email">{t('person.email')}</FieldLabel>
            <Input
              id="sign-up-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FieldDescription>{t('person.emailHint')}</FieldDescription>
          </Field>
          <FormError error={error} />
          <Nav
            submit
            busy={creating.isLoading}
            nextLabel={
              creating.isLoading ? t('signUp.creating') : t('signUp.create')
            }
            onBack={() => go('details')}
          />
        </form>
      )}

      {step === 'email' && signedIn && (
        <ConfirmEmail
          email={email.trim()}
          onDone={() =>
            void navigate({ href: landingFor(signedIn.user, undefined) })
          }
        />
      )}
    </AuthPage>
  );
}

/** How far along: one bar per step. */
function Progress({ at }: { at: number }) {
  return (
    <ol aria-hidden className="mb-6 grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={cn('h-1.5 rounded-full', i <= at ? 'bg-ink' : 'bg-muted')}
        />
      ))}
    </ol>
  );
}

function BackToSignIn() {
  const { t } = useTranslation();
  return (
    <Link
      to="/sign-in"
      className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
    >
      <ArrowLeft className="size-4" /> {t('signUp.haveAccount')}
    </Link>
  );
}

/** Back on the left, the way on at the right. */
function Nav({
  onBack,
  back,
  onNext,
  submit = false,
  nextDisabled = false,
  busy = false,
  nextLabel,
}: {
  onBack?: () => void;
  back?: React.ReactNode;
  onNext?: () => void;
  submit?: boolean;
  nextDisabled?: boolean;
  busy?: boolean;
  nextLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t pt-5">
      {back ??
        (onBack && (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft /> {t('signUp.back')}
          </Button>
        ))}
      <Button
        type={submit ? 'submit' : 'button'}
        variant="ink"
        className="min-w-32"
        disabled={nextDisabled || busy}
        onClick={submit ? undefined : onNext}
      >
        {nextLabel ?? t('signUp.next')}
      </Button>
    </div>
  );
}

/** After signing up: the address they gave gets its code, to confirm it now or later. */
function ConfirmEmail({
  email,
  onDone,
}: {
  email: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [requestCode] = useAuthRequestEmailCodeMutation();
  const [confirmEmail, confirming] = useAuthConfirmEmailMutation();
  const confirm = useConfirmCode(
    async (to) =>
      (await requestCode({ emailCodeRequestDto: { email: to } }).unwrap()).data,
  );
  const [tried, setTried] = useState(false);
  const normalised = email.toLowerCase();
  // The address is known: its code goes out as the step opens (once).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void confirm.send(normalised);
  }, [confirm, normalised]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (confirm.problem(normalised)) return;
    confirm.setError(null);
    try {
      await confirmEmail({
        confirmEmailDto: { email: normalised, code: confirm.digits },
      }).unwrap();
      onDone();
    } catch (e) {
      confirm.setError(toApiError(e as never));
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {t('signUp.emailIntro', { email })}
      </p>
      <ConfirmCodeBox
        email
        idPrefix="sign-up-email"
        to={normalised}
        shown={email}
        confirm={confirm}
        showProblem={tried}
        needed={t('signUp.emailNeeded')}
      />
      <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t pt-5">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('signUp.emailLater')}
        </Button>
        <Button
          type="submit"
          variant="ink"
          className="min-w-32"
          disabled={confirming.isLoading}
        >
          {t('signUp.emailConfirm')}
        </Button>
      </div>
    </form>
  );
}
