import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  CircleX,
  Hourglass,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type DetailField,
  type RegisteredParticipantDto,
  type RegisterParticipantDto,
  type RegistrationCheckDto,
  useParticipantsCheckMutation,
  useParticipantsRegisterMutation,
} from '@/api/generated/participants';
import { FormError } from '@/app/auth/form-error';
import { SegmentedChoice } from '@/app/auth/segmented-choice';
import type { Role } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { Language } from '@/i18n/languages';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { IdCheckList } from './id-check';
import { problemsOf } from './id-check-text';
import { registrableRoles } from './permissions';
import {
  DETAIL_FIELDS,
  EMPTY_PERSON,
  type IdCheck,
  missingFields,
  type PersonDraft,
  personRequest,
} from './person';
import { PersonFields } from './person-fields';
import { TemporaryPassword } from './temporary-password';

type Step = 'role' | 'details' | 'check' | 'done';
type Registrable = RegisterParticipantDto['role'];

/**
 * Registering someone (a field officer: a farmer, who is then theirs), in
 * steps: the role, their details, then the ID check and the duplicate checks
 * run on the server without saving, to confirm before it goes on the ledger.
 * The temporary password is shown once and texted to them.
 */
export function RegisterPerson() {
  const { t } = useTranslation();
  const viewer = useAppSelector((s) => s.session.user!.role);
  const roles = registrableRoles(viewer) as readonly Registrable[];
  const single = roles.length === 1;
  const [step, setStep] = useState<Step>(single ? 'details' : 'role');
  const [role, setRole] = useState<Registrable | null>(
    single ? roles[0]! : null,
  );
  const [person, setPerson] = useState<PersonDraft>(EMPTY_PERSON);
  const [language, setLanguage] = useState<Language>('bn');
  const [tried, setTried] = useState(false);
  const [problems, setProblems] = useState<
    Partial<Record<DetailField, string>>
  >({});
  const [error, setError] = useState<ApiError | null>(null);
  const [report, setReport] = useState<RegistrationCheckDto | null>(null);
  const [done, setDone] = useState<RegisteredParticipantDto | null>(null);
  const [check, checking] = useParticipantsCheckMutation();
  const [register, registering] = useParticipantsRegisterMutation();

  const body = (): RegisterParticipantDto => ({
    ...personRequest(person),
    role: role!,
    language,
  });

  async function runCheck(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (missingFields(person, DETAIL_FIELDS).length > 0) return;
    setError(null);
    try {
      const { data } = await check({ registerParticipantDto: body() }).unwrap();
      setReport(data);
      setProblems({
        ...problemsOf(data.checks as IdCheck[], t),
        ...(data.phoneTaken && {
          phone: t('errors.code.PHONE_ALREADY_REGISTERED'),
        }),
        ...(data.nidTaken && { nid: t('errors.code.NID_ALREADY_REGISTERED') }),
      });
      setStep('check');
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  async function confirm() {
    setError(null);
    try {
      setDone(
        (await register({ registerParticipantDto: body() }).unwrap()).data,
      );
      setStep('done');
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  function again() {
    setPerson(EMPTY_PERSON);
    setReport(null);
    setDone(null);
    setProblems({});
    setTried(false);
    setError(null);
    if (!single) setRole(null);
    setStep(single ? 'details' : 'role');
  }

  const blocked =
    report !== null &&
    (report.outcome === 'failed' || report.phoneTaken || report.nidTaken);
  const roleName = role ? t(`roles.${role as Role}`) : '';

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        title={
          viewer === 'field_officer'
            ? t('nav.sub.registerFarmer')
            : t('people.register')
        }
        description={step === 'role' ? t('people.new.intro') : undefined}
      />

      {step === 'role' && (
        <Card>
          <CardContent className="grid gap-5">
            <fieldset>
              <legend className="mb-3 font-medium">
                {t('people.new.whichRole')}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={role === r}
                    onClick={() => setRole(r)}
                    className={cn(
                      'relative flex min-h-12 items-center rounded-lg border px-4 py-3 text-left font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      role === r
                        ? 'border-ink bg-nav-active/40 ring-1 ring-ink'
                        : 'hover:bg-muted',
                    )}
                  >
                    {t(`roles.${r as Role}`)}
                    {role === r && (
                      <CircleCheck
                        aria-hidden
                        className="ml-auto size-5 text-ink"
                      />
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end border-t pt-5">
              <Button
                disabled={!role}
                onClick={() => setStep('details')}
                className="min-w-32"
              >
                {t('signUp.next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'details' && (
        <Card>
          <CardContent>
            <form
              noValidate
              onSubmit={(e) => void runCheck(e)}
              className="grid gap-5"
            >
              <p className="text-sm text-muted-foreground">
                {t('people.new.detailsIntro', { role: roleName })}
              </p>
              <PersonFields
                idPrefix="register"
                value={person}
                onChange={(next) => {
                  setPerson(next);
                  setProblems({});
                }}
                fields={DETAIL_FIELDS}
                problems={{
                  ...problems,
                  ...Object.fromEntries(
                    (tried ? missingFields(person, DETAIL_FIELDS) : []).map(
                      (f) => [f, t('person.required')],
                    ),
                  ),
                }}
              />
              <Field>
                <FieldLabel>{t('people.new.language')}</FieldLabel>
                <SegmentedChoice
                  legend={t('people.new.language')}
                  className="justify-self-start"
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'bn', label: 'বাংলা' },
                    { value: 'en', label: 'English' },
                  ]}
                />
                <FieldDescription>
                  {t('people.new.languageHint')}
                </FieldDescription>
              </Field>
              <FormError error={error} />
              <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t pt-5">
                {single ? (
                  <span />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('role')}
                  >
                    <ArrowLeft /> {t('signUp.back')}
                  </Button>
                )}
                <Button
                  type="submit"
                  className="min-w-32"
                  disabled={checking.isLoading}
                >
                  {checking.isLoading
                    ? t('people.new.checking')
                    : t('people.new.check')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'check' && report && (
        <Card>
          <CardContent className="grid gap-5">
            <Outcome report={report} />
            <IdCheckList checks={report.checks as IdCheck[]} />
            <FormError error={error} />
            <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t pt-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('details')}
              >
                <ArrowLeft />
                {blocked ? t('people.new.fix') : t('people.new.edit')}
              </Button>
              {!blocked && (
                <Button
                  className="min-w-32"
                  disabled={registering.isLoading}
                  onClick={() => void confirm()}
                >
                  {registering.isLoading
                    ? t('people.new.registering')
                    : t('people.new.register', { role: roleName })}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && done && (
        <Card>
          <CardContent className="grid gap-5">
            <Alert polite>
              {done.participant.chainState === 'submitted' ? (
                <Hourglass />
              ) : (
                <CircleCheck />
              )}
              <AlertTitle>
                {t('people.new.registered', {
                  name: done.participant.fullName,
                  role: roleName,
                })}
              </AlertTitle>
              <AlertDescription>
                {done.participant.chainState === 'submitted'
                  ? t('people.new.ledgerPending')
                  : viewer === 'field_officer'
                    ? t('people.new.nextOfficer')
                    : t('people.new.next')}
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <h2 className="font-semibold">{t('people.password.title')}</h2>
              <TemporaryPassword
                password={done.temporaryPassword}
                smsSent={done.smsSent}
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-5">
              <Link
                to="/people/$personId"
                params={{ personId: done.participant.id }}
                className={buttonVariants()}
              >
                {t('people.new.open')}
              </Link>
              <Button variant="outline" onClick={again}>
                {t('people.new.another')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** The check's verdict, in a line: register, register (warnings), or fix. */
function Outcome({ report }: { report: RegistrationCheckDto }) {
  const { t } = useTranslation();
  const taken = [
    report.phoneTaken && t('errors.code.PHONE_ALREADY_REGISTERED'),
    report.nidTaken && t('errors.code.NID_ALREADY_REGISTERED'),
  ].filter(Boolean);
  if (report.outcome === 'failed' || taken.length > 0) {
    return (
      <Alert variant="destructive">
        <CircleX />
        <AlertTitle>{t('people.new.cannot')}</AlertTitle>
        <AlertDescription>
          {taken.length > 0 ? taken.join(' ') : t('people.new.cannotText')}
        </AlertDescription>
      </Alert>
    );
  }
  if (report.outcome === 'flagged') {
    return (
      <Alert polite className="border-warning/40 bg-warning-soft/40">
        <CircleAlert />
        <AlertTitle>{t('people.new.flagged')}</AlertTitle>
        <AlertDescription>{t('people.new.flaggedText')}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert polite>
      <CircleCheck />
      <AlertTitle>{t('people.new.passed')}</AlertTitle>
      <AlertDescription>{t('people.new.passedText')}</AlertDescription>
    </Alert>
  );
}
