import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import { DISTRICTS } from '@/api/generated/codes';
import {
  type DetailField,
  type MyDetailsDto,
  useDetailChangesPhoneCodeMutation,
  useDetailChangesSubmitMutation,
} from '@/api/generated/participants';
import { FormError } from '@/app/auth/form-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { latinDigits } from '@/lib/format';
import { useSecondsUntil } from '@/lib/use-seconds-until';
import {
  DETAIL_FIELDS,
  type DetailsDraft,
  draftOf,
  localPhone,
  missingFields,
  OPERATOR_FIELDS,
  requestOf,
} from './details';

interface CodeSent {
  phone: string;
  sentAt: number;
  resendAt: number;
  minutes: number;
}

/**
 * Changing one's own details. A new number is confirmed by a code sent to
 * it before the change can be sent; the server checks everything again.
 */
export function DetailsForm({
  mine,
  onDone,
  onCancel,
}: {
  mine: MyDetailsDto;
  onDone: (result: MyDetailsDto) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fields = mine.needsApproval ? DETAIL_FIELDS : OPERATOR_FIELDS;
  const [draft, setDraft] = useState<DetailsDraft>(() =>
    // Changing again builds on the change still waiting.
    draftOf(
      mine.change?.status === 'pending' ? mine.change.requested : mine.current,
    ),
  );
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [submit, submitting] = useDetailChangesSubmitMutation();

  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<ApiError | null>(null);
  const [requestCode, requesting] = useDetailChangesPhoneCodeMutation();
  const wait = useSecondsUntil(sent?.resendAt ?? 0, sent?.sentAt ?? 0);

  const phone = localPhone(draft.phone);
  const newPhone = phone !== '' && phone !== localPhone(mine.current.phone);
  const codeSent = newPhone && sent?.phone === phone;
  const digits = latinDigits(code.trim());
  const codeProblem = !newPhone
    ? null
    : !codeSent
      ? t('account.phoneCode.missing')
      : !/^\d{6}$/.test(digits)
        ? t('account.phoneCode.malformed')
        : null;
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const codeInvalid = tried && codeProblem !== null;
  const missing = tried ? missingFields(draft, fields) : [];

  const districts = useMemo(() => {
    const collator = new Intl.Collator(i18n.language);
    return DISTRICTS.map((d) => ({
      value: d,
      label: t(`districts.${d}`),
    })).sort((a, b) => collator.compare(a.label, b.label));
  }, [t, i18n.language]);

  const set = (field: DetailField) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  async function sendCode() {
    setCodeError(null);
    try {
      const { data } = await requestCode({
        phoneCodeRequestDto: { phone },
      }).unwrap();
      setCode('');
      const sentAt = Date.now();
      setSent({
        phone,
        sentAt,
        resendAt: sentAt + data.resendAfterSeconds * 1000,
        minutes: Math.round(data.expiresInSeconds / 60),
      });
    } catch (e) {
      setCodeError(toApiError(e as never));
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (missingFields(draft, fields).length > 0 || codeProblem) return;
    setError(null);
    setCodeError(null);
    try {
      const { data } = await submit({
        detailChangeRequestDto: requestOf(
          draft,
          fields,
          newPhone ? digits : undefined,
        ),
      }).unwrap();
      onDone(data);
    } catch (e) {
      const failure = toApiError(e as never);
      if (failure?.code?.startsWith('SMS_CODE_')) setCodeError(failure);
      else setError(failure);
    }
  }

  const problem = (field: DetailField) =>
    missing.includes(field) ? t('account.details.required') : null;
  const fieldProps = (field: DetailField) => ({
    id: `details-${field}`,
    value: draft[field],
    'aria-invalid': problem(field) ? true : undefined,
  });

  return (
    <form noValidate onSubmit={(e) => void send(e)} className="grid gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          label={t('account.details.fullName')}
          problem={problem('fullName')}
          htmlFor="details-fullName"
        >
          <Input
            {...fieldProps('fullName')}
            autoComplete="name"
            onChange={(e) => set('fullName')(e.target.value)}
          />
        </TextField>
        <TextField
          label={t('account.details.phone')}
          problem={problem('phone')}
          htmlFor="details-phone"
        >
          <Input
            {...fieldProps('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            onChange={(e) => set('phone')(e.target.value)}
          />
        </TextField>

        {newPhone && (
          <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 md:col-span-2">
            {!codeSent ? (
              <>
                <p className="text-sm">{t('account.phoneCode.needed')}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  disabled={requesting.isLoading}
                  onClick={() => void sendCode()}
                >
                  {requesting.isLoading
                    ? t('account.phoneCode.sending')
                    : t('account.phoneCode.send')}
                </Button>
              </>
            ) : (
              <>
                <Alert polite>
                  <AlertDescription>
                    {t('account.phoneCode.sent', {
                      phone: sent.phone,
                      minutes: sent.minutes,
                    })}
                  </AlertDescription>
                </Alert>
                <Field
                  data-invalid={codeInvalid || undefined}
                  className="max-w-xs"
                >
                  <FieldLabel htmlFor="details-code">
                    {t('account.phoneCode.code')}
                  </FieldLabel>
                  <Input
                    id="details-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    aria-invalid={codeInvalid || undefined}
                    className="text-lg tracking-[0.3em]"
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                {wait > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('account.phoneCode.resendIn', { seconds: wait })}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto justify-self-start p-0"
                    disabled={requesting.isLoading}
                    onClick={() => void sendCode()}
                  >
                    {t('account.phoneCode.resend')}
                  </Button>
                )}
              </>
            )}
            {codeInvalid && !codeError && (
              <p role="alert" className="text-sm text-destructive">
                {codeProblem}
              </p>
            )}
            <FormError error={codeError} />
          </div>
        )}

        {fields.includes('nid') && (
          <>
            <TextField
              label={t('account.details.nid')}
              problem={problem('nid')}
              htmlFor="details-nid"
            >
              <Input
                {...fieldProps('nid')}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => set('nid')(e.target.value)}
              />
            </TextField>
            <TextField
              label={t('account.details.dateOfBirth')}
              problem={problem('dateOfBirth')}
              htmlFor="details-dateOfBirth"
            >
              <Input
                {...fieldProps('dateOfBirth')}
                type="date"
                autoComplete="bday"
                max={today}
                onChange={(e) => set('dateOfBirth')(e.target.value)}
              />
            </TextField>
            <TextField
              label={t('account.details.district')}
              problem={problem('district')}
              htmlFor="details-district"
            >
              <Select
                items={districts}
                value={draft.district || null}
                onValueChange={(v) => set('district')(v ?? '')}
              >
                <SelectTrigger
                  id="details-district"
                  className="w-full"
                  aria-invalid={problem('district') ? true : undefined}
                >
                  <SelectValue
                    placeholder={t('account.details.chooseDistrict')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TextField>
            <TextField
              label={t('account.details.address')}
              problem={problem('address')}
              htmlFor="details-address"
              className="md:col-span-2"
            >
              <Textarea
                {...fieldProps('address')}
                rows={2}
                autoComplete="street-address"
                onChange={(e) => set('address')(e.target.value)}
              />
            </TextField>
          </>
        )}
      </div>

      {mine.change?.status === 'pending' && (
        <FieldDescription>{t('account.details.replaces')}</FieldDescription>
      )}
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting.isLoading}>
          {submitting.isLoading
            ? t('account.details.submitting')
            : mine.needsApproval
              ? t('account.details.submit')
              : t('account.details.submitNow')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('account.details.cancel')}
        </Button>
      </div>
    </form>
  );
}

function TextField({
  label,
  htmlFor,
  problem,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  problem: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={problem ? true : undefined} className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}
