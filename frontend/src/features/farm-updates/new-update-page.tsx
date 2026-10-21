import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleAlert,
  ImagePlus,
  LocateFixed,
  MapPin,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type FieldRecordTypeDto,
  useCatalogGetQuery,
} from '@/api/generated/catalog';
import {
  type FieldRecordDto,
  useFieldRecordsFindOneQuery,
} from '@/api/generated/field-records';
import { useOnline } from '@/app/pwa/online';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorText } from '@/i18n/text';
import { useFormat } from '@/i18n/use-format';
import { type DraftRejection, drafts } from '@/lib/drafts';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  draftProblems,
  type FarmUpdateData,
  hasProblems,
  type MeasurementProblem,
} from './draft';
import { useObjectUrl, useOfficerProjects, useSendNow } from './hooks';
import { shrinkPhoto } from './photo';
import { fromLocalInput, type NewUpdateSearch, toLocalInput } from './search';
import { useCurrentLocation } from './use-location';

const STEPS = ['project', 'type', 'photo', 'details', 'review'] as const;
type Step = (typeof STEPS)[number];
const NOTES_MAX = 2000;

interface Initial {
  id: string;
  data: FarmUpdateData;
  photo: Blob | null;
  rejection: DraftRejection | null;
  createdAt?: number;
  step: Step;
}

const blank = (): FarmUpdateData => ({
  projectId: '',
  projectTitle: '',
  farmerName: '',
  entryTypeCode: '',
  measurements: {},
  notes: '',
  location: null,
  observedAt: new Date().toISOString(),
  correctsEntryId: null,
  correcting: null,
  photoId: null,
});

/**
 * A farm update in five steps, made for a phone in the field: project,
 * type, photo, details, review. Saved on the phone and sent when online.
 * Also opens a draft to fix it, or a record to correct it.
 */
export function NewUpdatePage({ search }: { search: NewUpdateSearch }) {
  const initial = useInitial(search);
  const { t } = useTranslation();
  if (initial.status === 'loading') return <LoadingState />;
  if (initial.status === 'missing') {
    return (
      <EmptyState icon={CircleAlert} title={t('farmUpdates.draftMissing')} />
    );
  }
  if (initial.status === 'error') {
    return <ErrorState error={initial.error} onRetry={initial.retry} />;
  }
  return <UpdateForm key={initial.value.id} initial={initial.value} />;
}

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'error';
      error: NonNullable<ReturnType<typeof toApiError>>;
      retry: () => void;
    }
  | { status: 'ready'; value: Initial };

/** What the form starts from: a draft, a record to correct, or nothing. */
function useInitial(search: NewUpdateSearch): Loaded {
  const me = useAppSelector((s) => s.session.user!.id);
  const { i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  const record = useFieldRecordsFindOneQuery(
    { id: search.corrects ?? '' },
    { skip: !search.corrects },
  );
  const { projects, loading } = useOfficerProjects();
  const [fromDraft, setFromDraft] = useState<Initial | 'missing' | null>(null);
  const [freshId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!search.draft) return;
    let live = true;
    void drafts.get<FarmUpdateData>(search.draft).then((d) => {
      if (!live) return;
      setFromDraft(
        d && d.ownerId === me && d.kind === 'farm-update'
          ? {
              id: d.id,
              data: d.data,
              photo: d.photos[0] ?? null,
              rejection: d.rejection,
              createdAt: d.createdAt,
              step: 'review',
            }
          : 'missing',
      );
    });
    return () => {
      live = false;
    };
  }, [search.draft, me]);

  if (search.draft) {
    if (fromDraft === null) return { status: 'loading' };
    if (fromDraft === 'missing') return { status: 'missing' };
    return { status: 'ready', value: fromDraft };
  }
  if (search.corrects) {
    if (record.isLoading) return { status: 'loading' };
    if (record.error || !record.data) {
      return {
        status: 'error',
        error: toApiError(record.error) ?? {
          kind: 'not-found',
          status: 404,
          messages: [],
        },
        retry: () => void record.refetch(),
      };
    }
    return {
      status: 'ready',
      value: correctionOf(freshId, record.data.data, me, bengali),
    };
  }
  if (search.project && loading) return { status: 'loading' };
  const project = search.project
    ? projects.find((p) => p.id === search.project)
    : undefined;
  return {
    status: 'ready',
    value: {
      id: freshId,
      data: project
        ? {
            ...blank(),
            projectId: project.id,
            projectTitle: project.title,
            farmerName: project.farmer.name,
          }
        : blank(),
      photo: null,
      rejection: null,
      step: project ? 'type' : 'project',
    },
  };
}

/** A new record that corrects `r`: the same project, its values to change. */
function correctionOf(
  id: string,
  r: FieldRecordDto,
  me: string,
  bengali: boolean,
): Initial {
  return {
    id,
    data: {
      ...blank(),
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      farmerName: r.farmer.name,
      entryTypeCode: r.entryTypeCode,
      measurements: Object.fromEntries(
        r.measurements.map((m) => [m.key, m.value]),
      ),
      notes: r.notes ?? '',
      correctsEntryId: r.id,
      correcting: {
        observedAt: String(r.observedAt),
        typeName: bengali ? r.entryTypeNameBn : r.entryTypeName,
      },
      // The officer's own photo can stay; anyone else's must be retaken.
      photoId: r.photo && r.recordedBy.id === me ? r.photo.id : null,
    },
    photo: null,
    rejection: null,
    step: 'type',
  };
}

function UpdateForm({ initial }: { initial: Initial }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const me = useAppSelector((s) => s.session.user!.id);
  const online = useOnline();
  const catalog = useCatalogGetQuery({});
  const { send } = useSendNow();
  const [data, setData] = useState(initial.data);
  const [photo, setPhoto] = useState<Blob | null>(initial.photo);
  const [step, setStep] = useState<Step>(initial.step);
  const [tried, setTried] = useState<Set<Step>>(new Set());
  const [saving, setSaving] = useState(false);
  const location = useCurrentLocation();
  const bengali = i18n.resolvedLanguage === 'bn';

  // The phone's location, once found, unless the update already has one.
  const found =
    location.state.status === 'found' ? location.state.location : null;
  const current: FarmUpdateData =
    data.location || !found ? data : { ...data, location: found };

  const types = useMemo(
    () =>
      (catalog.data?.data.fieldRecordTypes ?? []).filter(
        (x) => x.active || x.code === data.entryTypeCode,
      ),
    [catalog.data, data.entryTypeCode],
  );
  const type = types.find((x) => x.code === data.entryTypeCode);
  const problems = draftProblems(current, type, !!photo || !!data.photoId);
  const index = STEPS.indexOf(step);
  const stepBlocked: Record<Step, boolean> = {
    project: problems.project,
    type: problems.type,
    photo: problems.photo,
    details:
      problems.location ||
      problems.observedAt ||
      Object.keys(problems.measurements).length > 0,
    review: hasProblems(problems),
  };
  const set = (patch: Partial<FarmUpdateData>) =>
    setData((d) => ({ ...d, ...patch }));
  const show = (s: Step) => tried.has(s);

  function next() {
    setTried((x) => new Set(x).add(step));
    if (stepBlocked[step]) return;
    setStep(STEPS[index + 1]!);
  }

  async function save() {
    setTried(new Set(STEPS));
    if (stepBlocked.review) return;
    setSaving(true);
    try {
      await drafts.save<FarmUpdateData>({
        id: initial.id,
        ownerId: me,
        kind: 'farm-update',
        data: current,
        photos: photo ? [photo] : [],
        rejection: null,
        createdAt: initial.createdAt,
      });
      if (!online) {
        toast.success(t('farmUpdates.savedOffline'));
        void navigate({ to: '/farm-updates/drafts' });
        return;
      }
      await send().catch(() => null);
      const left = await drafts.get(initial.id);
      if (!left) {
        toast.success(t('farmUpdates.sent'));
        void navigate({ to: '/farm-updates/sent' });
      } else {
        if (left.rejection) toast.error(t('farmUpdates.needsFixingToast'));
        else toast.success(t('farmUpdates.savedWaiting'));
        void navigate({ to: '/farm-updates/drafts' });
      }
    } finally {
      setSaving(false);
    }
  }

  const title = data.correctsEntryId
    ? t('farmUpdates.correctTitle')
    : initial.rejection || initial.createdAt
      ? t('farmUpdates.draftTitle')
      : t('nav.sub.newUpdate');

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5">
      <PageHeader title={title} description={t('farmUpdates.formIntro')} />
      {data.correcting && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {t('farmUpdates.correcting', {
              type: data.correcting.typeName,
              at: fmt.dateTime(data.correcting.observedAt),
            })}
          </AlertTitle>
          <AlertDescription>{t('farmUpdates.correctingText')}</AlertDescription>
        </Alert>
      )}
      {initial.rejection && <Rejection rejection={initial.rejection} />}
      <Steps current={index} />

      <section
        className="grid gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-6"
        aria-labelledby="step-title"
      >
        <h2 id="step-title" className="text-lg font-bold">
          {t(`farmUpdates.step.${step}`)}
        </h2>

        {step === 'project' && (
          <ProjectStep
            selected={data.projectId}
            locked={!!data.correctsEntryId}
            title={data.projectTitle}
            onPick={(p) =>
              set({
                projectId: p.id,
                projectTitle: p.title,
                farmerName: p.farmer.name,
              })
            }
            invalid={show('project') && problems.project}
          />
        )}

        {step === 'type' && (
          <div className="grid gap-3">
            {catalog.isLoading && <LoadingState />}
            <div
              role="radiogroup"
              aria-label={t('farmUpdates.step.type')}
              className="grid gap-2 sm:grid-cols-2"
            >
              {types.map((x) => (
                <Choice
                  key={x.code}
                  name="type"
                  checked={x.code === data.entryTypeCode}
                  onSelect={() =>
                    set({
                      entryTypeCode: x.code,
                      measurements: keepReadings(data.measurements, x),
                    })
                  }
                  title={bengali ? x.nameBn : x.name}
                  note={
                    x.requiresPhoto ? t('farmUpdates.photoNeeded') : undefined
                  }
                />
              ))}
            </div>
            {show('type') && problems.type && (
              <FieldError>{t('farmUpdates.required.type')}</FieldError>
            )}
          </div>
        )}

        {step === 'photo' && (
          <PhotoStep
            photo={photo}
            keptPhotoUrl={
              data.photoId && !photo && data.correctsEntryId
                ? `/api/field-records/${data.correctsEntryId}/photo`
                : null
            }
            required={!!type?.requiresPhoto}
            onPhoto={(blob) => {
              setPhoto(blob);
              set({ photoId: null });
            }}
            invalid={show('photo') && problems.photo}
          />
        )}

        {step === 'details' && type && (
          <DetailsStep
            type={type}
            data={data}
            set={set}
            problems={problems.measurements}
            observedInvalid={problems.observedAt}
            showErrors={show('details')}
          />
        )}
        {step === 'details' && (
          <LocationLine
            data={current}
            state={location.state}
            onRetry={() => {
              set({ location: null });
              location.retry();
            }}
            required={!!type?.requiresLocation}
            invalid={show('details') && problems.location}
          />
        )}

        {step === 'review' && (
          <Review
            data={current}
            type={type}
            photo={photo}
            problems={problems}
            goTo={setStep}
          />
        )}

        <div className="flex gap-3 pt-2">
          {index > 0 && (
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setStep(STEPS[index - 1]!)}
            >
              <ArrowLeft /> {t('farmUpdates.back')}
            </Button>
          )}
          {step !== 'review' ? (
            <Button size="lg" className="flex-1" onClick={next}>
              {step === 'photo' &&
              !photo &&
              !data.photoId &&
              !type?.requiresPhoto
                ? t('farmUpdates.skipPhoto')
                : t('farmUpdates.next')}
              <ArrowRight />
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              disabled={saving}
              onClick={() => void save()}
            >
              <Check />{' '}
              {saving
                ? t('farmUpdates.saving')
                : online
                  ? t('farmUpdates.saveAndSend')
                  : t('farmUpdates.saveOnPhone')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

/** Readings that still belong to the chosen type. */
function keepReadings(
  values: Record<string, string>,
  type: FieldRecordTypeDto,
) {
  const keys = new Set(type.measurements.map((m) => m.key));
  return Object.fromEntries(
    Object.entries(values).filter(([k]) => keys.has(k)),
  );
}

function Steps({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <ol
      className="grid grid-cols-5 gap-1.5"
      aria-label={t('farmUpdates.stepOf', {
        step: current + 1,
        total: STEPS.length,
      })}
    >
      {STEPS.map((s, i) => (
        <li key={s} className="grid gap-1 text-center">
          <span
            className={cn(
              'h-1.5 rounded-full',
              i <= current ? 'bg-brand' : 'bg-muted',
            )}
          />
          <span
            className={cn(
              'truncate text-xs',
              i === current ? 'font-semibold' : 'text-muted-foreground',
            )}
          >
            {t(`farmUpdates.stepShort.${s}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A large choice card; a real radio button underneath. */
function Choice({
  name,
  checked,
  onSelect,
  title,
  sub,
  note,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  sub?: ReactNode;
  note?: string;
}) {
  return (
    <label
      className={cn(
        'grid min-h-14 cursor-pointer gap-0.5 rounded-xl border px-4 py-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
        checked ? 'border-brand bg-success-soft' : 'bg-card hover:bg-muted',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="flex items-center justify-between gap-2 font-semibold">
        {title}
        {checked && <Check aria-hidden className="size-5 text-brand" />}
      </span>
      {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </label>
  );
}

function ProjectStep({
  selected,
  locked,
  title,
  onPick,
  invalid,
}: {
  selected: string;
  locked: boolean;
  title: string;
  onPick: (p: { id: string; title: string; farmer: { name: string } }) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const online = useOnline();
  const { projects, loading, savedAt } = useOfficerProjects();
  const [q, setQ] = useState<string | undefined>();
  if (locked) {
    return (
      <div className="grid gap-2">
        <Choice
          name="project"
          checked
          onSelect={() => undefined}
          title={title}
        />
        <p className="text-sm text-muted-foreground">
          {t('farmUpdates.projectLocked')}
        </p>
      </div>
    );
  }
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const shown = projects.filter((p) => {
    const text =
      `${p.title} ${p.farmer.name} ${p.location} ${p.district}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  return (
    <div className="grid gap-3">
      <SearchBox
        value={q}
        onSearch={setQ}
        placeholder={t('farmUpdates.findProject')}
      />
      {savedAt && (
        <p className="text-xs text-muted-foreground">
          {t('farmUpdates.listFromPhone', { at: fmt.relative(savedAt) })}
        </p>
      )}
      {loading && <LoadingState />}
      {!loading && projects.length === 0 && (
        <p className="text-muted-foreground">
          {online
            ? t('farmUpdates.noProjects')
            : t('farmUpdates.noProjectsOffline')}
        </p>
      )}
      {projects.length > 0 && shown.length === 0 && (
        <p className="text-muted-foreground">
          {t('farmUpdates.noProjectMatch')}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={t('farmUpdates.step.project')}
        className="grid gap-2"
      >
        {shown.map((p) => (
          <Choice
            key={p.id}
            name="project"
            checked={p.id === selected}
            onSelect={() => onPick(p)}
            title={p.title}
            sub={`${p.farmer.name} · ${p.location}, ${p.district}`}
          />
        ))}
      </div>
      {invalid && <FieldError>{t('farmUpdates.required.project')}</FieldError>}
    </div>
  );
}

function PhotoStep({
  photo,
  keptPhotoUrl,
  required,
  onPhoto,
  invalid,
}: {
  photo: Blob | null;
  keptPhotoUrl: string | null;
  required: boolean;
  onPhoto: (blob: Blob) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const preview = useObjectUrl(photo);
  const kept = useApiFile(keptPhotoUrl);
  const shown = preview ?? kept.url;

  async function picked(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onPhoto(await shrinkPhoto(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {required
          ? t('farmUpdates.photoRequired')
          : t('farmUpdates.photoOptional')}
      </p>
      {shown && (
        <img
          src={shown}
          alt={t('farmUpdates.photoAlt')}
          className="max-h-80 w-full rounded-xl bg-muted object-contain"
        />
      )}
      {photo ? (
        <p className="text-xs text-muted-foreground">
          {t('farmUpdates.photoSize', {
            size: fmt.number(Math.max(1, Math.round(photo.size / 1024))),
          })}
        </p>
      ) : (
        keptPhotoUrl && (
          <p className="text-sm text-muted-foreground">
            {t('farmUpdates.keptPhoto')}
          </p>
        )
      )}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void picked(e.target.files?.[0])}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => void picked(e.target.files?.[0])}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          size="lg"
          disabled={busy}
          onClick={() => camera.current?.click()}
        >
          <Camera />{' '}
          {shown ? t('farmUpdates.retake') : t('farmUpdates.takePhoto')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={busy}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus /> {t('farmUpdates.fromGallery')}
        </Button>
      </div>
      {busy && (
        <p className="text-sm text-muted-foreground">
          {t('farmUpdates.preparingPhoto')}
        </p>
      )}
      {invalid && <FieldError>{t('farmUpdates.required.photo')}</FieldError>}
    </div>
  );
}

function DetailsStep({
  type,
  data,
  set,
  problems,
  observedInvalid,
  showErrors,
}: {
  type: FieldRecordTypeDto;
  data: FarmUpdateData;
  set: (patch: Partial<FarmUpdateData>) => void;
  problems: Record<string, MeasurementProblem>;
  observedInvalid: boolean;
  showErrors: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const [now] = useState(() => toLocalInput(new Date().toISOString()));
  const problemText = (p: MeasurementProblem) =>
    p.kind === 'decimals'
      ? t('farmUpdates.problem.decimals', { count: p.decimals })
      : p.kind === 'min'
        ? t('farmUpdates.problem.min', { min: fmt.number(p.min) })
        : p.kind === 'max'
          ? t('farmUpdates.problem.max', { max: fmt.number(p.max) })
          : t(`farmUpdates.problem.${p.kind}`);
  return (
    <div className="grid gap-5">
      {type.measurements.map((m) => {
        const problem = showErrors ? problems[m.key] : undefined;
        const range =
          m.min != null && m.max != null
            ? t('farmUpdates.range', {
                min: fmt.number(m.min),
                max: fmt.number(m.max),
              })
            : m.min != null
              ? t('farmUpdates.atLeast', { min: fmt.number(m.min) })
              : '';
        return (
          <Field key={m.key} data-invalid={problem ? true : undefined}>
            <FieldLabel htmlFor={`m-${m.key}`}>
              {bengali ? m.labelBn : m.label}
              {m.unit && ` (${m.unit})`}
              {!m.required && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {t('farmUpdates.optional')}
                </span>
              )}
            </FieldLabel>
            <Input
              id={`m-${m.key}`}
              inputMode={m.decimals > 0 ? 'decimal' : 'numeric'}
              value={data.measurements[m.key] ?? ''}
              aria-invalid={problem ? true : undefined}
              onChange={(e) =>
                set({
                  measurements: {
                    ...data.measurements,
                    [m.key]: e.target.value,
                  },
                })
              }
            />
            {problem ? (
              <FieldError>{problemText(problem)}</FieldError>
            ) : (
              range && <FieldDescription>{range}</FieldDescription>
            )}
          </Field>
        );
      })}
      <Field>
        <FieldLabel htmlFor="update-notes">{t('farmUpdates.notes')}</FieldLabel>
        <Textarea
          id="update-notes"
          rows={3}
          maxLength={NOTES_MAX}
          value={data.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      <Field data-invalid={showErrors && observedInvalid ? true : undefined}>
        <FieldLabel htmlFor="update-observed">
          {t('farmUpdates.observedAt')}
        </FieldLabel>
        <Input
          id="update-observed"
          type="datetime-local"
          max={now}
          value={toLocalInput(data.observedAt)}
          onChange={(e) => {
            const iso = fromLocalInput(e.target.value);
            if (iso) set({ observedAt: iso });
          }}
        />
        {showErrors && observedInvalid && (
          <FieldError>{t('farmUpdates.required.observedAt')}</FieldError>
        )}
      </Field>
    </div>
  );
}

function LocationLine({
  data,
  state,
  onRetry,
  required,
  invalid,
}: {
  data: FarmUpdateData;
  state: ReturnType<typeof useCurrentLocation>['state'];
  onRetry: () => void;
  required: boolean;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const loc = data.location;
  return (
    <div
      className={cn(
        'grid gap-2 rounded-xl border p-3',
        invalid && 'border-destructive',
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <MapPin aria-hidden className="size-4" /> {t('farmUpdates.location')}
      </p>
      {loc ? (
        <p className="text-sm">
          {loc.latitude}, {loc.longitude}
          {loc.accuracyMeters != null && (
            <span className="text-muted-foreground">
              {' '}
              ·{' '}
              {t('farmUpdates.accuracy', {
                metres: fmt.number(loc.accuracyMeters),
              })}
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(`farmUpdates.locationState.${state.status}`)}
        </p>
      )}
      {(loc || state.status !== 'locating') && (
        <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          <LocateFixed />{' '}
          {loc ? t('farmUpdates.locateAgain') : t('farmUpdates.tryAgain')}
        </Button>
      )}
      {invalid && required && (
        <FieldError>{t('farmUpdates.required.location')}</FieldError>
      )}
    </div>
  );
}

function Review({
  data,
  type,
  photo,
  problems,
  goTo,
}: {
  data: FarmUpdateData;
  type: FieldRecordTypeDto | undefined;
  photo: Blob | null;
  problems: ReturnType<typeof draftProblems>;
  goTo: (s: Step) => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const preview = useObjectUrl(photo);
  const readings = (type?.measurements ?? []).filter(
    (m) => (data.measurements[m.key] ?? '').trim() !== '',
  );
  const row = (step: Step, label: string, value: ReactNode, bad: boolean) => (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="grid min-w-0 gap-0.5">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd
          className={cn('font-medium break-words', bad && 'text-destructive')}
        >
          {value}
        </dd>
      </div>
      <Button variant="ghost" size="sm" onClick={() => goTo(step)}>
        {t('farmUpdates.change')}
      </Button>
    </div>
  );
  return (
    <dl className="divide-y">
      {row(
        'project',
        t('farmUpdates.step.project'),
        data.projectTitle
          ? `${data.projectTitle} · ${data.farmerName}`
          : t('farmUpdates.missing'),
        problems.project,
      )}
      {row(
        'type',
        t('farmUpdates.step.type'),
        type ? (bengali ? type.nameBn : type.name) : t('farmUpdates.missing'),
        problems.type,
      )}
      {row(
        'photo',
        t('farmUpdates.step.photo'),
        preview ? (
          <img src={preview} alt="" className="mt-1 h-24 rounded-lg" />
        ) : data.photoId ? (
          t('farmUpdates.keptPhoto')
        ) : problems.photo ? (
          t('farmUpdates.missing')
        ) : (
          t('farmUpdates.noPhoto')
        ),
        problems.photo,
      )}
      {row(
        'details',
        t('farmUpdates.step.details'),
        <span className="grid gap-0.5">
          {readings.map((m) => (
            <span key={m.key}>
              {bengali ? m.labelBn : m.label}:{' '}
              {fmt.number(data.measurements[m.key]!)}
              {m.unit && ` ${m.unit}`}
            </span>
          ))}
          {data.notes.trim() && (
            <span className="whitespace-pre-line">{data.notes.trim()}</span>
          )}
          <span>{fmt.dateTime(data.observedAt)}</span>
          <span>
            {data.location
              ? `${data.location.latitude}, ${data.location.longitude}`
              : t('farmUpdates.noLocation')}
          </span>
        </span>,
        Object.keys(problems.measurements).length > 0 ||
          problems.location ||
          problems.observedAt,
      )}
    </dl>
  );
}

/** Why the server refused a draft, in the reader's language. */
export function Rejection({ rejection }: { rejection: DraftRejection }) {
  const { t, i18n } = useTranslation();
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{t('farmUpdates.needsFixing')}</AlertTitle>
      <AlertDescription>
        {errorText(
          {
            kind: 'invalid',
            status: 422,
            messages: [rejection.message],
            code: rejection.code,
            details: rejection.details,
          },
          i18n,
        )}
      </AlertDescription>
    </Alert>
  );
}
