import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type DetailField,
  type MyDetailsDto,
  useDetailChangesPhoneCodeMutation,
  useDetailChangesSubmitMutation,
} from '@/api/generated/participants';
import { FormError } from '@/app/auth/form-error';
import { Button } from '@/components/ui/button';
import { FieldDescription } from '@/components/ui/field';
import {
  DETAIL_FIELDS,
  draftOf,
  localPhone,
  missingFields,
  OPERATOR_FIELDS,
  type PersonDraft,
} from '@/features/people/person';
import { PersonFields } from '@/features/people/person-fields';
import { ConfirmCodeBox } from '@/features/people/phone-code';
import { useConfirmCode } from '@/features/people/use-confirm-code';
import { requestOf } from './details';

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
  const { t } = useTranslation();
  const fields = mine.needsApproval ? DETAIL_FIELDS : OPERATOR_FIELDS;
  const [draft, setDraft] = useState<PersonDraft>(() =>
    // Changing again builds on the change still waiting.
    draftOf(
      mine.change?.status === 'pending' ? mine.change.requested : mine.current,
    ),
  );
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [submit, submitting] = useDetailChangesSubmitMutation();
  const [requestCode] = useDetailChangesPhoneCodeMutation();
  const confirm = useConfirmCode(
    async (phone) =>
      (await requestCode({ phoneCodeRequestDto: { phone } }).unwrap()).data,
  );

  const phone = localPhone(draft.phone);
  const newPhone = phone !== '' && phone !== localPhone(mine.current.phone);
  const missing = tried ? missingFields(draft, fields) : [];
  const problems = Object.fromEntries(
    missing.map((f) => [f, t('person.required')]),
  ) as Partial<Record<DetailField, string>>;

  async function send(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (
      missingFields(draft, fields).length > 0 ||
      (newPhone && confirm.problem(phone))
    ) {
      return;
    }
    setError(null);
    confirm.setError(null);
    try {
      const { data } = await submit({
        detailChangeRequestDto: requestOf(
          draft,
          fields,
          newPhone ? confirm.digits : undefined,
        ),
      }).unwrap();
      onDone(data);
    } catch (e) {
      const failure = toApiError(e as never);
      if (failure?.code?.startsWith('CODE_')) confirm.setError(failure);
      else setError(failure);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void send(e)} className="grid gap-5">
      <PersonFields
        idPrefix="details"
        value={draft}
        onChange={setDraft}
        fields={fields}
        problems={problems}
        afterPhone={
          newPhone && (
            <ConfirmCodeBox
              idPrefix="details"
              to={phone}
              shown={phone}
              confirm={confirm}
              showProblem={tried}
              needed={t('account.phoneNeeded')}
            />
          )
        }
      />
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
