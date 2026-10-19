import { Mail } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { toApiError } from '@/api/errors';
import {
  useAuthConfirmEmailMutation,
  useAuthMeQuery,
  useAuthRemoveEmailMutation,
  useAuthRequestEmailCodeMutation,
} from '@/api/generated/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorText } from '@/i18n/text';
import { ConfirmCodeBox } from '@/features/people/phone-code';
import { useConfirmCode } from '@/features/people/use-confirm-code';

/** Looks like an address; the server checks it properly. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Their email address: once confirmed by a code emailed to it, it signs in
 * like their number. Adding, changing or removing it needs no admin.
 */
export function EmailCard() {
  const { t, i18n } = useTranslation();
  const current = useAuthMeQuery().data?.data.email ?? null;
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [requestCode] = useAuthRequestEmailCodeMutation();
  const [confirmEmail, confirming] = useAuthConfirmEmailMutation();
  const [removeEmail, removing] = useAuthRemoveEmailMutation();
  const confirm = useConfirmCode(
    async (to) =>
      (await requestCode({ emailCodeRequestDto: { email: to } }).unwrap()).data,
  );
  const normalised = email.trim().toLowerCase();
  const malformed = !EMAIL.test(normalised);

  function reset() {
    setEditing(false);
    setEmail('');
    setTried(false);
    confirm.setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (malformed || confirm.problem(normalised)) return;
    confirm.setError(null);
    try {
      await confirmEmail({
        confirmEmailDto: { email: normalised, code: confirm.digits },
      }).unwrap();
      toast.success(t('account.email.saved'));
      reset();
    } catch (e) {
      confirm.setError(toApiError(e as never));
    }
  }

  async function remove() {
    try {
      await removeEmail().unwrap();
      toast.success(t('account.email.removed'));
    } catch (e) {
      toast.error(errorText(toApiError(e as never)!, i18n));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('account.email.title')}</CardTitle>
        <CardDescription>{t('account.email.intro')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="flex items-center gap-2 font-medium break-all">
          <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {current ?? (
            <span className="font-normal text-muted-foreground">
              {t('account.email.none')}
            </span>
          )}
        </p>
        {editing ? (
          <form
            noValidate
            onSubmit={(e) => void submit(e)}
            className="grid gap-4"
          >
            <Field data-invalid={(tried && malformed) || undefined}>
              <FieldLabel htmlFor="account-email">
                {current ? t('account.email.new') : t('person.email')}
              </FieldLabel>
              <Input
                id="account-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                aria-invalid={(tried && malformed) || undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
              {tried && malformed && (
                <FieldError>{t('account.email.malformed')}</FieldError>
              )}
            </Field>
            {!malformed && (
              <ConfirmCodeBox
                email
                idPrefix="account-email"
                to={normalised}
                shown={email.trim()}
                confirm={confirm}
                showProblem={tried}
                needed={t('signUp.emailNeeded')}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={confirming.isLoading}>
                {t('signUp.emailConfirm')}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                {t('account.details.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              {current ? t('account.email.change') : t('account.email.add')}
            </Button>
            {current && (
              <Button
                variant="ghost"
                disabled={removing.isLoading}
                onClick={() => void remove()}
              >
                {t('account.email.remove')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
