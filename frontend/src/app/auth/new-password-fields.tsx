import { useTranslation } from 'react-i18next';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { PasswordInput } from './password-input';
import {
  type NewPassword,
  newPasswordProblem,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from './password-rules';

/**
 * A new password, typed twice. Problems show only once the form was sent
 * (`showProblems`), never while typing.
 */
export function NewPasswordFields({
  value,
  onChange,
  showProblems,
  idPrefix,
}: {
  value: NewPassword;
  onChange: (next: NewPassword) => void;
  showProblems: boolean;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const problem = showProblems ? newPasswordProblem(value) : null;
  const firstWrong = problem === 'tooShort' || problem === 'tooLong';
  return (
    <>
      <Field data-invalid={firstWrong || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-new`}>{t('password.new')}</FieldLabel>
        <PasswordInput
          id={`${idPrefix}-new`}
          autoComplete="new-password"
          value={value.value}
          aria-invalid={firstWrong || undefined}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
        {firstWrong ? (
          <FieldError>
            {problem === 'tooShort'
              ? t('password.tooShort', { min: PASSWORD_MIN })
              : t('password.tooLong', { max: PASSWORD_MAX })}
          </FieldError>
        ) : (
          <FieldDescription>
            {t('password.rule', { min: PASSWORD_MIN })}
          </FieldDescription>
        )}
      </Field>
      <Field data-invalid={problem === 'mismatch' || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-again`}>
          {t('password.confirm')}
        </FieldLabel>
        <PasswordInput
          id={`${idPrefix}-again`}
          autoComplete="new-password"
          value={value.again}
          aria-invalid={problem === 'mismatch' || undefined}
          onChange={(e) => onChange({ ...value, again: e.target.value })}
        />
        {problem === 'mismatch' && (
          <FieldError>{t('password.mismatch')}</FieldError>
        )}
      </Field>
    </>
  );
}
