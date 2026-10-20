import { CircleAlert, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type ParticipantDetailDto,
  type RevocationReason,
  useParticipantsOpenWorkQuery,
  useParticipantsRevokeMutation,
} from '@/api/generated/participants';
import { FormError } from '@/app/auth/form-error';
import { isStaff, type Role } from '@/app/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { OfficerPicker } from './officer-picker';

/** The reasons that fit: staff leave a job; others leave the platform. */
const STAFF_REASONS: readonly RevocationReason[] = [
  'resigned',
  'dismissed',
  'contract_ended',
  'other',
];
const PARTICIPANT_REASONS: readonly RevocationReason[] = [
  'left_platform',
  'terms_breach',
  'contract_ended',
  'other',
];
const NOTE_MAX = 300;

/**
 * Taking a verified person's access away: why, what they still have open,
 * and for a field officer who takes over their farmers. The server moves
 * the farmers on the ledger, then revokes.
 */
export function RevokeAccessDialog({
  person,
  open,
  onClose,
}: {
  person: ParticipantDetailDto;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const work = useParticipantsOpenWorkQuery({ id: person.id }, { skip: !open });
  const [revoke, revoking] = useParticipantsRevokeMutation();
  const [reason, setReason] = useState<RevocationReason | null>(null);
  const [note, setNote] = useState('');
  const [replacement, setReplacement] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const reasons = isStaff(person.role as Role)
    ? STAFF_REASONS
    : PARTICIPANT_REASONS;
  const farmers = work.data?.data.farmersToMove ?? 0;
  const items = work.data?.data.items ?? [];
  const missing = {
    reason: reason === null,
    note: reason === 'other' && note.trim() === '',
    replacement: farmers > 0 && replacement === null,
  };

  function close() {
    setReason(null);
    setNote('');
    setReplacement(null);
    setTried(false);
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean) || !reason) return;
    setError(null);
    try {
      await revoke({
        id: person.id,
        revokeAccessDto: {
          reason,
          ...(note.trim() && { note: note.trim() }),
          ...(farmers > 0 &&
            replacement && { replacementOfficerId: replacement }),
        },
      }).unwrap();
      toast.success(t('people.actions.revoked', { name: person.fullName }));
      close();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('people.actions.revokeTitle', { name: person.fullName })}
          </DialogTitle>
          <DialogDescription>
            {t('people.actions.revokeText')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <OpenWork
            loading={work.isLoading}
            error={toApiError(work.error)}
            items={items}
          />

          <FieldSet data-invalid={(tried && missing.reason) || undefined}>
            <FieldLegend variant="label">
              {t('people.actions.revokeReason')}
            </FieldLegend>
            <RadioGroup
              value={reason}
              onValueChange={(v) => setReason(v as RevocationReason)}
              className="gap-2"
            >
              {reasons.map((r) => (
                <Field key={r} orientation="horizontal">
                  <RadioGroupItem value={r} id={`revoke-${r}`} />
                  <FieldLabel htmlFor={`revoke-${r}`} className="font-normal">
                    {t(`people.revocationReason.${r}`)}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
            {tried && missing.reason && (
              <FieldError>{t('catalog.required.choose')}</FieldError>
            )}
          </FieldSet>

          <Field data-invalid={(tried && missing.note) || undefined}>
            <FieldLabel htmlFor="revoke-note">
              {t('people.actions.revokeNote')}
            </FieldLabel>
            <Textarea
              id="revoke-note"
              rows={2}
              maxLength={NOTE_MAX}
              value={note}
              aria-invalid={(tried && missing.note) || undefined}
              onChange={(e) => setNote(e.target.value)}
            />
            {tried && missing.note ? (
              <FieldError>{t('people.actions.noteRequired')}</FieldError>
            ) : (
              <FieldDescription>
                {t('people.actions.revokeNoteHint')}
              </FieldDescription>
            )}
          </Field>

          {farmers > 0 && (
            <section className="grid gap-3" aria-labelledby="hand-over-title">
              <div>
                <h3 id="hand-over-title" className="font-semibold">
                  {t('people.actions.handOver')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('people.actions.handOverText', { count: farmers })}
                </p>
              </div>
              <OfficerPicker
                open={open}
                exclude={[person.id]}
                value={replacement}
                onChange={setReplacement}
              />
              {tried && missing.replacement && (
                <FieldError>{t('people.actions.chooseReplacement')}</FieldError>
              )}
            </section>
          )}

          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('people.actions.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={revoking.isLoading || work.isLoading}
            >
              {revoking.isLoading
                ? t('people.actions.working')
                : t('people.actions.revoke')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What they still have open, before it is left behind. */
function OpenWork({
  loading,
  error,
  items,
}: {
  loading: boolean;
  error: ApiError | null;
  items: ReadonlyArray<{ kind: string; count: number }>;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">{t('states.loading')}</p>
    );
  }
  if (error) return <FormError error={error} />;
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users aria-hidden className="size-4" />
        {t('people.actions.openWorkNone')}
      </p>
    );
  }
  return (
    <Alert>
      <CircleAlert />
      <AlertTitle>{t('people.actions.openWork')}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{t('people.actions.openWorkIntro')}</p>
        <ul className="list-disc pl-5">
          {items.map((i) => (
            <li key={i.kind}>
              {t(`people.openWork.${i.kind as 'farmers_assigned'}`, {
                count: i.count,
              })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
