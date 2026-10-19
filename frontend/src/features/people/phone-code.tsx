import { useTranslation } from 'react-i18next';
import { FormError } from '@/app/auth/form-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ConfirmCode } from './use-confirm-code';

/**
 * The box under a number (or address) to confirm: send the code, then type
 * it, with the wait before another one. `showProblem` once the form was sent.
 */
export function ConfirmCodeBox({
  to,
  shown,
  confirm,
  showProblem,
  idPrefix,
  needed,
  email = false,
}: {
  to: string;
  /** `to` as the person typed it, in the message. */
  shown: string;
  confirm: ConfirmCode;
  showProblem: boolean;
  idPrefix: string;
  /** Why a code is needed, before one is sent. */
  needed: string;
  email?: boolean;
}) {
  const { t } = useTranslation();
  const problem = showProblem ? confirm.problem(to) : null;
  const sent = confirm.sentTo(to) ? confirm.sent : null;
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">
      {!sent ? (
        <>
          <p className="text-sm">{needed}</p>
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={confirm.requesting}
            onClick={() => void confirm.send(to)}
          >
            {confirm.requesting ? t('phoneCode.sending') : t('phoneCode.send')}
          </Button>
        </>
      ) : (
        <>
          <Alert polite>
            <AlertDescription>
              {t(email ? 'phoneCode.sentEmail' : 'phoneCode.sent', {
                to: shown,
                minutes: sent.minutes,
              })}
            </AlertDescription>
          </Alert>
          <Field data-invalid={problem ? true : undefined} className="max-w-xs">
            <FieldLabel htmlFor={`${idPrefix}-code`}>
              {t(email ? 'phoneCode.codeEmail' : 'phoneCode.code')}
            </FieldLabel>
            <Input
              id={`${idPrefix}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={confirm.code}
              aria-invalid={problem ? true : undefined}
              className="text-lg tracking-[0.3em]"
              onChange={(e) => confirm.setCode(e.target.value)}
            />
          </Field>
          {confirm.wait > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('phoneCode.resendIn', { seconds: confirm.wait })}
            </p>
          ) : (
            <Button
              type="button"
              variant="link"
              className="h-auto justify-self-start p-0"
              disabled={confirm.requesting}
              onClick={() => void confirm.send(to)}
            >
              {t('phoneCode.resend')}
            </Button>
          )}
        </>
      )}
      {problem && !confirm.error && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <FormError error={confirm.error} />
    </div>
  );
}
