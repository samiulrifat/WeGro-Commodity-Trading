import { useNavigate } from '@tanstack/react-router';
import { CloudRain, Plus } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { District } from '@/api/generated/codes';
import {
  type WeatherEventDto,
  useInsuranceListWeatherEventsQuery,
  useInsuranceRecordWeatherEventMutation,
} from '@/api/generated/insurance';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useDistrictOptions } from '@/features/people/use-district-options';
import { useFormat } from '@/i18n/use-format';
import { todayBd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { SEVERITIES, type Severity } from './insurance-utils';
import { SeverityPill } from './status';
import { useDistrictName, useEventTypeName } from './use-names';

const PAGE_SIZE = 12;

/**
 * Weather events recorded per district, newest first: what claims cite.
 * Admins and insurers record them; searched by event type or district.
 */
export function WeatherEventsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [recording, setRecording] = useState(false);
  const page = search.page ?? 1;
  const query = useInsuranceListWeatherEventsQuery({
    page,
    limit: PAGE_SIZE,
    q: search.q,
  });
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/insurance/weather-events',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const records = actsAs(role, 'admin') || role === 'insurer';

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.recordedEvents')}
        description={t('insurance.eventsIntro')}
        actions={
          records && (
            <Button onClick={() => setRecording(true)}>
              <Plus /> {t('insurance.recordEvent')}
            </Button>
          )
        }
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('insurance.searchEvents')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon={CloudRain}
          title={
            search.q ? t('insurance.noEventMatch') : t('insurance.noEvents')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({
                  to: '/insurance/weather-events',
                  search: { ...search, page: p },
                })
              }
            />
          )}
        </>
      )}
      {recording && <RecordDialog onClose={() => setRecording(false)} />}
    </div>
  );
}

function EventCard({ event: e }: { event: WeatherEventDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const eventName = useEventTypeName();
  const district = useDistrictName();
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          {eventName(e.eventType)} · {district(e.district)}
        </h3>
        <p className="text-sm text-muted-foreground">
          {fmt.date(e.occurredOn)} ·{' '}
          {t('insurance.recordedBy', { name: e.recordedBy.name })}
        </p>
      </div>
      {e.notes && (
        <p translate="no" className="text-sm whitespace-pre-line">
          {e.notes}
        </p>
      )}
      <span className="flex flex-wrap gap-1.5">
        <SeverityPill severity={e.severity} />
      </span>
    </article>
  );
}

/** An admin or insurer records an event; claims in that district can then cite it. */
function RecordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const eventName = useEventTypeName();
  const districts = useDistrictOptions();
  const catalog = useCatalogGetQuery({});
  const [record, saving] = useInsuranceRecordWeatherEventMutation();
  const today = todayBd();
  const [district, setDistrict] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(today);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const types = useMemo(
    () =>
      (catalog.data?.data.weatherEventTypes ?? [])
        .filter((e) => e.active)
        .map((e) => ({ value: e.code, label: eventName(e) })),
    [catalog.data, eventName],
  );
  const missing = {
    district: !district,
    type: !type,
    occurredOn: !occurredOn || occurredOn > today,
    severity: !severity,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await record({
        recordWeatherEventDto: {
          districtCode: district as District,
          eventTypeCode: type!,
          occurredOn,
          severity: severity!,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }).unwrap();
      toast.success(t('insurance.eventRecorded'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('insurance.recordEvent')}</DialogTitle>
          <DialogDescription>
            {t('insurance.recordEventText')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('type') || undefined}>
              <FieldLabel htmlFor="event-type">
                {t('insurance.eventType')}
              </FieldLabel>
              <SearchSelect
                id="event-type"
                options={types}
                value={type}
                onValueChange={setType}
                placeholder={t('insurance.chooseEventType')}
                emptyText={t('insurance.noEventTypes')}
                invalid={show('type')}
              />
              {show('type') && (
                <FieldError>{t('insurance.required.eventType')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('district') || undefined}>
              <FieldLabel htmlFor="event-district">
                {t('market.district')}
              </FieldLabel>
              <SearchSelect
                id="event-district"
                options={districts}
                value={district}
                onValueChange={setDistrict}
                placeholder={t('person.chooseDistrict')}
                emptyText={t('insurance.noDistrict')}
                invalid={show('district')}
              />
              {show('district') && (
                <FieldError>{t('market.required.district')}</FieldError>
              )}
            </Field>
          </div>
          <Field data-invalid={show('occurredOn') || undefined}>
            <FieldLabel htmlFor="event-date">
              {t('insurance.occurredOn')}
            </FieldLabel>
            <Input
              id="event-date"
              type="date"
              max={today}
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              aria-invalid={show('occurredOn') || undefined}
            />
            {show('occurredOn') && (
              <FieldError>{t('insurance.required.occurredOn')}</FieldError>
            )}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('insurance.severityLabel')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                  className={cn(
                    'min-h-11 rounded-lg border px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    severity === s
                      ? 'border-ink bg-ink text-white'
                      : 'bg-card hover:bg-muted',
                    show('severity') && 'border-danger',
                  )}
                >
                  {t(`insurance.severity.${s}`)}
                </button>
              ))}
            </div>
            {show('severity') && (
              <p className="text-sm text-danger">
                {t('insurance.required.severity')}
              </p>
            )}
          </fieldset>
          <Field>
            <FieldLabel htmlFor="event-notes">
              {t('insurance.eventNotes')}
            </FieldLabel>
            <Textarea
              id="event-notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <FieldDescription>{t('insurance.eventNotesHint')}</FieldDescription>
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={saving.isLoading}>
              {saving.isLoading
                ? t('people.actions.working')
                : t('insurance.recordEvent')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
