import { skipToken } from '@reduxjs/toolkit/query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import type { District } from '@/api/generated/codes';
import {
  useInsuranceCoverageQuery,
  useInsuranceListWeatherEventsQuery,
  useInsuranceOpenClaimMutation,
} from '@/api/generated/insurance';
import { useProjectsListQuery } from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { PhotoPicker } from '@/components/photo-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/combobox';
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
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/use-format';
import { usePhotoPicks } from '@/lib/use-photo-picks';
import { MAX_CLAIM_PHOTOS, typedPercent } from './insurance-utils';
import { useEventTypeName } from './use-names';

/**
 * The farmer's field officer (or an admin) claims for crop damage: on an
 * insured project with cover, citing a recorded weather event of a covered
 * type in the project's district, with the damage seen, what happened and
 * up to five photos. Sent at once (claims are not kept offline).
 */
export function OpenClaimDialog({
  projectId: fixed,
  onClose,
}: {
  projectId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormat();
  const eventName = useEventTypeName();
  const funded = useProjectsListQuery(
    { stage: 'funded', limit: 100 },
    { skip: !!fixed },
  );
  const active = useProjectsListQuery(
    { stage: 'active', limit: 100 },
    { skip: !!fixed },
  );
  const [projectId, setProjectId] = useState<string | null>(fixed ?? null);
  const coverage = useInsuranceCoverageQuery(
    projectId ? { projectId } : skipToken,
  );
  const cover = coverage.data?.data;
  const events = useInsuranceListWeatherEventsQuery(
    cover
      ? { districtCode: cover.district.code as District, limit: 50 }
      : skipToken,
  );
  const [open, opening] = useInsuranceOpenClaimMutation();
  const picks = usePhotoPicks(MAX_CLAIM_PHOTOS);
  const [eventId, setEventId] = useState<string | null>(null);
  const [damage, setDamage] = useState('');
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const projects = useMemo(
    () =>
      [...(funded.data?.data ?? []), ...(active.data?.data ?? [])]
        .filter((p) => p.insured)
        .map((p) => ({
          value: p.id,
          label: `${p.title} · ${p.farmer.fullName}`,
        })),
    [funded.data, active.data],
  );
  const covered = new Set(cover?.current?.coveredEventTypes.map((e) => e.code));
  const eventOptions = (events.data?.data ?? [])
    .filter((e) => covered.has(e.eventType.code))
    .map((e) => ({
      value: e.id,
      label: `${eventName(e.eventType)} · ${fmt.date(e.occurredOn)} · ${t(`insurance.severity.${e.severity}`)}`,
    }));
  const percent = typedPercent(damage);
  const missing = {
    project: !projectId || !cover?.current,
    event: !eventId,
    damage: !percent || Number(percent) <= 0,
    notes: !notes.trim(),
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (picks.uploading || Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      const res = await open({
        projectId: projectId!,
        openClaimDto: {
          eventId: eventId!,
          damagePercent: percent!,
          notes: notes.trim(),
          ...(picks.ids.length > 0 ? { photoIds: picks.ids } : {}),
        },
      }).unwrap();
      toast.success(t('insurance.claimOpened'));
      onClose();
      void navigate({
        to: '/insurance/claims/$claimId',
        params: { claimId: res.data.id },
      });
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  const busy = opening.isLoading || picks.uploading;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('insurance.move.openClaim')}</DialogTitle>
          <DialogDescription>{t('insurance.openClaimText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          {!fixed && (
            <Field data-invalid={show('project') || undefined}>
              <FieldLabel htmlFor="claim-project">
                {t('warehouse.project')}
              </FieldLabel>
              <SearchSelect
                id="claim-project"
                options={projects}
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setEventId(null);
                }}
                placeholder={t('warehouse.chooseProject')}
                emptyText={t('insurance.noInsuredProjects')}
                invalid={show('project')}
              />
              {show('project') && !projectId && (
                <FieldError>{t('warehouse.required.project')}</FieldError>
              )}
            </Field>
          )}
          {cover && !cover.current && (
            <Alert variant="destructive">
              <AlertDescription>
                {cover.insurer
                  ? t('insurance.waitingForCover', {
                      insurer: cover.insurer.name,
                    })
                  : t('insurance.waitingForInsurer')}
              </AlertDescription>
            </Alert>
          )}
          {cover?.current && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              {t('insurance.coverSummary', {
                insurer: cover.insurer?.name ?? '',
                remaining: fmt.taka(cover.remaining),
              })}
            </p>
          )}
          <Field data-invalid={show('event') || undefined}>
            <FieldLabel htmlFor="claim-event">
              {t('insurance.weatherEvent')}
            </FieldLabel>
            <SearchSelect
              id="claim-event"
              options={eventOptions}
              value={eventId}
              onValueChange={setEventId}
              placeholder={t('insurance.chooseEvent')}
              emptyText={t('insurance.noCoveredEvents')}
              disabled={!cover?.current}
              invalid={show('event')}
            />
            {show('event') ? (
              <FieldError>{t('insurance.required.event')}</FieldError>
            ) : (
              <FieldDescription>{t('insurance.eventHint')}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={show('damage') || undefined}>
            <FieldLabel htmlFor="claim-damage">
              {t('insurance.damageSeen')}
            </FieldLabel>
            <Input
              id="claim-damage"
              inputMode="decimal"
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              aria-invalid={show('damage') || undefined}
            />
            {show('damage') ? (
              <FieldError>{t('insurance.required.damage')}</FieldError>
            ) : (
              <FieldDescription>{t('insurance.damageHint')}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={show('notes') || undefined}>
            <FieldLabel htmlFor="claim-notes">
              {t('insurance.whatHappened')}
            </FieldLabel>
            <Textarea
              id="claim-notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-invalid={show('notes') || undefined}
            />
            {show('notes') && (
              <FieldError>{t('insurance.required.notes')}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel>{t('market.photos')}</FieldLabel>
            <PhotoPicker picks={picks} />
            <FieldDescription>
              {t('insurance.photosHint', { count: MAX_CLAIM_PHOTOS })}
            </FieldDescription>
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? t('people.actions.working')
                : t('insurance.move.openClaim')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
