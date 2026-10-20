import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { District } from '@/api/generated/codes';
import {
  type ProjectsListApiArg,
  useProjectsListQuery,
} from '@/api/generated/projects';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDistrictOptions } from '@/features/people/use-district-options';
import { useAppSelector } from '@/store/hooks';
import { cn } from '@/lib/utils';
import { ProjectCard } from './project-card';
import { type ProjectsSearch, STAGES, type Tab } from './projects-search';

const PAGE_SIZE = 12;
const ANY = '';

/** Who sees drafts and every stage; others see published projects. */
const STAFF = new Set([
  'super_admin',
  'admin',
  'accounts',
  'operations',
  'auditor',
  'field_officer',
]);

/**
 * Projects as cards: quick tabs (all, long term, short term, saved), search
 * by words of the title, the place or the crop, and for staff the stage,
 * crop and district. `drafts` shows an admin's drafts only.
 */
export function ProjectsList({
  search,
  drafts = false,
}: {
  search: ProjectsSearch;
  drafts?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const staff = STAFF.has(role);
  const page = search.page ?? 1;
  const arg: ProjectsListApiArg = {
    page,
    limit: PAGE_SIZE,
    q: search.q,
    stage: drafts ? 'draft' : search.stage,
    produceCode: search.produce,
    districtCode: search.district,
    durationType:
      search.tab === 'long_term' || search.tab === 'short_term'
        ? search.tab
        : undefined,
    favourites: search.tab === 'saved' || undefined,
  };
  const query = useProjectsListQuery(arg);
  const path = drafts ? '/projects/drafts' : '/projects';
  const set = (patch: Partial<ProjectsSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });

  const title = drafts
    ? t('nav.sub.drafts')
    : role === 'farmer'
      ? t('nav.myProjects')
      : staff
        ? t('nav.sub.allProjects')
        : t('projects.browse');
  const tabs: Tab[] =
    role === 'investor'
      ? ['all', 'long_term', 'short_term', 'saved']
      : ['all', 'long_term', 'short_term'];
  const filtered = Boolean(
    search.q || search.stage || search.produce || search.district || search.tab,
  );
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        description={
          meta ? t('projects.count', { count: meta.total }) : undefined
        }
        actions={
          role === 'admin' && (
            <Link to="/projects/new" className={buttonVariants()}>
              <Plus /> {t('projects.new')}
            </Link>
          )
        }
      />

      {!drafts && (
        <div
          role="tablist"
          aria-label={t('projects.tabsLabel')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {tabs.map((tab) => {
            const on = (search.tab ?? 'all') === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => set({ tab: tab === 'all' ? undefined : tab })}
                className={cn(
                  'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  on
                    ? 'border-ink bg-ink text-white'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {t(`projects.tab.${tab}`)}
              </button>
            );
          })}
        </div>
      )}

      <Filters search={search} staff={staff} drafts={drafts} onChange={set} />

      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon={Sprout}
          title={
            filtered
              ? t('projects.noMatch')
              : drafts
                ? t('projects.noDrafts')
                : search.tab === 'saved'
                  ? t('projects.noneSaved')
                  : t('projects.none')
          }
          description={filtered ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} staff={staff} />
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({ to: path, search: { ...search, page: p } })
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function Filters({
  search,
  staff,
  drafts,
  onChange,
}: {
  search: ProjectsSearch;
  staff: boolean;
  drafts: boolean;
  onChange: (patch: Partial<ProjectsSearch>) => void;
}) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalogGetQuery({});
  const districts = useDistrictOptions();
  const bengali = i18n.resolvedLanguage === 'bn';
  const crops = [
    { value: ANY, label: t('projects.anyCrop') },
    ...(catalog.data?.data.produceTypes ?? []).map((p) => ({
      value: p.code,
      label: bengali ? p.nameBn : p.name,
    })),
  ];
  const stages = [
    { value: ANY, label: t('projects.anyStage') },
    ...STAGES.map((s) => ({ value: s, label: t(`projects.stage.${s}`) })),
  ];
  const districtItems = [
    { value: ANY, label: t('people.anyDistrict') },
    ...districts,
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
      <SearchBox
        value={search.q}
        onSearch={(q) => onChange({ q })}
        placeholder={t('projects.search')}
      />
      <Choice
        label={t('projects.crop')}
        items={crops}
        value={search.produce ?? ANY}
        onChange={(v) => onChange({ produce: v || undefined })}
      />
      <Choice
        label={t('person.district')}
        items={districtItems}
        value={search.district ?? ANY}
        onChange={(v) => onChange({ district: (v || undefined) as District })}
      />
      {staff && !drafts && (
        <Choice
          label={t('projects.stageLabel')}
          items={stages}
          value={search.stage ?? ANY}
          onChange={(v) =>
            onChange({ stage: (v || undefined) as ProjectsSearch['stage'] })
          }
        />
      )}
    </div>
  );
}

function Choice({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => onChange(v ?? '')}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value || 'any'} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
