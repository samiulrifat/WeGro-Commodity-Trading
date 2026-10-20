import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ImageUp } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { District } from '@/api/generated/codes';
import {
  type CreateProjectDto,
  type ProjectDto,
  useProjectsCreateMutation,
  useProjectsFindOneQuery,
  useProjectsUpdateMutation,
} from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  CheckField,
  ChoiceField,
  TextField,
} from '@/features/catalog/entry-form';
import { OfficerPicker } from '@/features/people/officer-picker';
import { useDistrictOptions } from '@/features/people/use-district-options';
import { useFormat } from '@/i18n/use-format';
import { useProjectsSetCoverMutation } from './api';
import { ProjectPhoto } from './project-card';
import { shortPercent, toPoisha, typedTaka } from './project-math';

interface Draft {
  title: string;
  description: string;
  produceCode: string;
  districtCode: string;
  location: string;
  farmerId: string | null;
  farmerName: string;
  durationType: 'short_term' | 'long_term' | '';
  durationMonths: string;
  payoutIntervalMonths: string;
  fundingTarget: string;
  slotPrice: string;
  farmerPercent: string;
  investorPercent: string;
  wegroPercent: string;
  returnMin: string;
  returnMax: string;
  insured: boolean;
  plannedStartDate: string;
}

const EMPTY: Draft = {
  title: '',
  description: '',
  produceCode: '',
  districtCode: '',
  location: '',
  farmerId: null,
  farmerName: '',
  durationType: '',
  durationMonths: '',
  payoutIntervalMonths: '0',
  fundingTarget: '',
  slotPrice: '',
  farmerPercent: '40',
  investorPercent: '40',
  wegroPercent: '20',
  returnMin: '',
  returnMax: '',
  insured: false,
  plannedStartDate: '',
};

const fromProject = (p: ProjectDto): Draft => ({
  title: p.title,
  description: p.description ?? '',
  produceCode: p.produce.code,
  districtCode: p.district.code,
  location: p.location,
  farmerId: p.farmer.id,
  farmerName: p.farmer.fullName,
  durationType: p.durationType,
  durationMonths: String(p.durationMonths),
  payoutIntervalMonths: String(p.payoutIntervalMonths),
  fundingTarget: p.fundingTarget.replace(/\.00$/, ''),
  slotPrice: p.slotPrice.replace(/\.00$/, ''),
  farmerPercent: shortPercent(p.split.farmer),
  investorPercent: shortPercent(p.split.investors),
  wegroPercent: shortPercent(p.split.wegro),
  returnMin: shortPercent(p.estimatedReturn.minPercent),
  returnMax: shortPercent(p.estimatedReturn.maxPercent),
  insured: p.insured,
  plannedStartDate: p.plannedStartDate ?? '',
});

/** "8.5" to 850 basis points; null when not a percent with up to 2 decimals. */
function bps(text: string): number | null {
  const t = typedTaka(text);
  if (t === null) return null;
  const v = Number(toPoisha(t));
  return v <= 10_000 ? v : null;
}

const whole = (text: string, min: number, max: number) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

type Problem =
  | 'title'
  | 'produceCode'
  | 'districtCode'
  | 'location'
  | 'farmerId'
  | 'durationType'
  | 'durationMonths'
  | 'payoutIntervalMonths'
  | 'fundingTarget'
  | 'slotPrice'
  | 'split'
  | 'returnMin'
  | 'returnMax';

/** The request, or what is missing or malformed (the server checks the rules between fields). */
function request(d: Draft): { dto?: CreateProjectDto; problems: Set<Problem> } {
  const p = new Set<Problem>();
  if (d.title.trim().length < 3) p.add('title');
  if (!d.produceCode) p.add('produceCode');
  if (!d.districtCode) p.add('districtCode');
  if (d.location.trim().length < 2) p.add('location');
  if (!d.farmerId) p.add('farmerId');
  if (!d.durationType) p.add('durationType');
  const months = whole(d.durationMonths, 1, 255);
  if (months === null) p.add('durationMonths');
  const interval = whole(d.payoutIntervalMonths || '0', 0, 255);
  if (interval === null) p.add('payoutIntervalMonths');
  const target = typedTaka(d.fundingTarget);
  if (!target) p.add('fundingTarget');
  const price = typedTaka(d.slotPrice);
  if (!price) p.add('slotPrice');
  const split = [
    bps(d.farmerPercent),
    bps(d.investorPercent),
    bps(d.wegroPercent),
  ];
  if (split.some((v) => v === null)) p.add('split');
  const min = bps(d.returnMin);
  const max = bps(d.returnMax);
  if (min === null) p.add('returnMin');
  if (max === null) p.add('returnMax');
  if (p.size > 0) return { problems: p };
  return {
    problems: p,
    dto: {
      title: d.title.trim(),
      ...(d.description.trim() && { description: d.description.trim() }),
      produceCode: d.produceCode,
      districtCode: d.districtCode as District,
      location: d.location.trim(),
      farmerId: d.farmerId!,
      durationType: d.durationType as 'short_term' | 'long_term',
      durationMonths: months!,
      payoutIntervalMonths: interval!,
      fundingTarget: target!,
      slotPrice: price!,
      farmerBps: split[0]!,
      investorBps: split[1]!,
      wegroBps: split[2]!,
      insured: d.insured,
      estimatedReturnMinBps: min!,
      estimatedReturnMaxBps: max!,
      ...(d.plannedStartDate && { plannedStartDate: d.plannedStartDate }),
    },
  };
}

/** A new draft, or a draft to change (`id`), with its cover photo. */
export function ProjectFormPage({ id }: { id?: string }) {
  const query = useProjectsFindOneQuery({ id: id! }, { skip: !id });
  if (id && query.isLoading) return <LoadingState />;
  if (id && (query.error || !query.data)) {
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ProjectForm project={query.data?.data ?? null} />;
}

function ProjectForm({ project }: { project: ProjectDto | null }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const catalog = useCatalogGetQuery({});
  const districts = useDistrictOptions();
  const [draft, setDraft] = useState<Draft>(() =>
    project ? fromProject(project) : EMPTY,
  );
  const [pickFarmer, setPickFarmer] = useState(!project);
  const [cover, setCover] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [create] = useProjectsCreateMutation();
  const [update] = useProjectsUpdateMutation();
  const [setCoverPhoto] = useProjectsSetCoverMutation();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const { dto, problems } = request(draft);
  const show = (k: Problem) =>
    tried && problems.has(k) ? t(`projects.form.required.${k}`) : undefined;
  const bengali = i18n.resolvedLanguage === 'bn';
  const crops = useMemo(
    () =>
      (catalog.data?.data.produceTypes ?? []).map((c) => ({
        value: c.code,
        label: bengali ? c.nameBn : c.name,
      })),
    [catalog.data, bengali],
  );
  const units =
    typedTaka(draft.fundingTarget) &&
    typedTaka(draft.slotPrice) &&
    toPoisha(typedTaka(draft.slotPrice)!) > 0n
      ? Number(
          toPoisha(typedTaka(draft.fundingTarget)!) /
            toPoisha(typedTaka(draft.slotPrice)!),
        )
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!dto) return;
    setError(null);
    setBusy(true);
    try {
      const saved = project
        ? await update({ id: project.id, updateProjectDto: dto }).unwrap()
        : await create({ createProjectDto: dto }).unwrap();
      if (cover) {
        await setCoverPhoto({
          id: saved.data.id,
          body: { file: cover },
        }).unwrap();
      }
      toast.success(
        t(project ? 'projects.form.saved' : 'projects.form.created'),
      );
      void navigate({
        to: '/projects/$projectId',
        params: { projectId: saved.data.id },
      });
    } catch (e) {
      setError(toApiError(e as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Link
        to={project ? '/projects/$projectId' : '/projects/drafts'}
        params={project ? { projectId: project.id } : undefined}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project ? project.title : t('nav.sub.drafts')}
      </Link>
      <PageHeader
        title={project ? t('projects.form.editTitle') : t('projects.new')}
        description={t('projects.form.intro')}
      />
      <form
        noValidate
        onSubmit={(e) => void submit(e)}
        className="grid gap-6 lg:max-w-3xl"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('projects.form.about')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <TextField
              id="project-title"
              label={t('projects.form.title')}
              value={draft.title}
              maxLength={120}
              onChange={(title) => set({ title })}
              error={show('title')}
            />
            <TextField
              id="project-description"
              label={t('projects.form.description')}
              value={draft.description}
              maxLength={2000}
              multiline
              onChange={(description) => set({ description })}
              hint={t('projects.form.descriptionHint')}
            />
            <CoverField project={project} file={cover} onChange={setCover} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('projects.form.cropPlace')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <ChoiceField
                id="project-crop"
                label={t('projects.crop')}
                value={draft.produceCode}
                placeholder={t('catalog.choose')}
                options={crops}
                onChange={(produceCode) => set({ produceCode })}
                error={show('produceCode')}
              />
              <ChoiceField
                id="project-district"
                label={t('person.district')}
                value={draft.districtCode}
                placeholder={t('person.chooseDistrict')}
                options={districts}
                onChange={(districtCode) => set({ districtCode })}
                error={show('districtCode')}
              />
            </div>
            <TextField
              id="project-location"
              label={t('projects.form.location')}
              value={draft.location}
              maxLength={200}
              onChange={(location) => set({ location })}
              hint={t('projects.form.locationHint')}
              error={show('location')}
            />
            <div className="grid gap-2">
              <p className="text-sm font-medium">{t('roles.farmer')}</p>
              {draft.farmerId && !pickFarmer ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <span className="font-medium">{draft.farmerName}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickFarmer(true)}
                  >
                    {t('projects.form.changeFarmer')}
                  </Button>
                </div>
              ) : (
                <OfficerPicker
                  open
                  personRole="farmer"
                  placeholder={t('projects.form.findFarmer')}
                  exclude={[]}
                  value={draft.farmerId}
                  onChange={(farmerId) => set({ farmerId })}
                />
              )}
              {show('farmerId') && (
                <p className="text-sm text-destructive">{show('farmerId')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('projects.form.money')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="project-target"
                label={t('projects.target')}
                value={draft.fundingTarget}
                inputMode="decimal"
                maxLength={17}
                onChange={(fundingTarget) => set({ fundingTarget })}
                error={show('fundingTarget')}
              />
              <TextField
                id="project-price"
                label={t('projects.unitPrice')}
                value={draft.slotPrice}
                inputMode="decimal"
                maxLength={17}
                onChange={(slotPrice) => set({ slotPrice })}
                hint={
                  units !== null
                    ? t('projects.form.unitsHint', { count: units })
                    : t('projects.form.priceHint')
                }
                error={show('slotPrice')}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="project-return-min"
                label={t('projects.form.returnMin')}
                value={draft.returnMin}
                inputMode="decimal"
                maxLength={6}
                onChange={(returnMin) => set({ returnMin })}
                error={show('returnMin')}
              />
              <TextField
                id="project-return-max"
                label={t('projects.form.returnMax')}
                value={draft.returnMax}
                inputMode="decimal"
                maxLength={6}
                onChange={(returnMax) => set({ returnMax })}
                error={show('returnMax')}
              />
            </div>
            <FieldDescription>{t('projects.form.returnHint')}</FieldDescription>
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-medium">
                {t('projects.split')}
              </legend>
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  id="project-split-investors"
                  label={t('projects.form.investors')}
                  value={draft.investorPercent}
                  inputMode="decimal"
                  maxLength={6}
                  onChange={(investorPercent) => set({ investorPercent })}
                />
                <TextField
                  id="project-split-farmer"
                  label={t('roles.farmer')}
                  value={draft.farmerPercent}
                  inputMode="decimal"
                  maxLength={6}
                  onChange={(farmerPercent) => set({ farmerPercent })}
                />
                <TextField
                  id="project-split-wegro"
                  label="WeGro"
                  value={draft.wegroPercent}
                  inputMode="decimal"
                  maxLength={6}
                  onChange={(wegroPercent) => set({ wegroPercent })}
                />
              </div>
              <FieldDescription>
                {show('split') ?? t('projects.form.splitHint')}
              </FieldDescription>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('projects.form.timing')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <ChoiceField
                id="project-duration-type"
                label={t('projects.form.term')}
                value={draft.durationType}
                placeholder={t('catalog.choose')}
                options={[
                  { value: 'short_term', label: t('projects.tab.short_term') },
                  { value: 'long_term', label: t('projects.tab.long_term') },
                ]}
                onChange={(durationType) => set({ durationType })}
                hint={t('projects.form.termHint')}
                error={show('durationType')}
              />
              <TextField
                id="project-months"
                label={t('projects.form.months')}
                value={draft.durationMonths}
                inputMode="numeric"
                maxLength={3}
                onChange={(durationMonths) => set({ durationMonths })}
                error={show('durationMonths')}
              />
              <TextField
                id="project-interval"
                label={t('projects.form.interval')}
                value={draft.payoutIntervalMonths}
                inputMode="numeric"
                maxLength={3}
                onChange={(payoutIntervalMonths) =>
                  set({ payoutIntervalMonths })
                }
                hint={t('projects.form.intervalHint')}
                error={show('payoutIntervalMonths')}
              />
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <label htmlFor="project-start" className="text-sm font-medium">
                {t('projects.plannedStart')}
              </label>
              <Input
                id="project-start"
                type="date"
                value={draft.plannedStartDate}
                onChange={(e) => set({ plannedStartDate: e.target.value })}
              />
              {draft.plannedStartDate && (
                <p className="text-sm text-muted-foreground">
                  {fmt.date(draft.plannedStartDate)}
                </p>
              )}
            </div>
            <CheckField
              id="project-insured"
              label={t('projects.insured')}
              hint={t('projects.form.insuredHint')}
              checked={draft.insured}
              onChange={(insured) => set({ insured })}
            />
          </CardContent>
        </Card>

        <FormError error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t('catalog.saving') : t('projects.form.saveDraft')}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** The card's photo: the current one, or the one chosen to replace it. */
function CoverField({
  project,
  file,
  onChange,
}: {
  project: ProjectDto | null;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const { t } = useTranslation();
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{t('projects.form.cover')}</p>
      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="size-28 rounded-xl object-cover"
          />
        ) : project ? (
          <ProjectPhoto project={project} className="size-28 rounded-xl" />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
            <ImageUp aria-hidden />
          </div>
        )}
        <div className="grid gap-1">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t('projects.form.cover')}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
          <p className="text-sm text-muted-foreground">
            {t('projects.form.coverHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
