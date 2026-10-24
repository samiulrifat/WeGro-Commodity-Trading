import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type InsuredProjectDto,
  useInsuranceInsuredProjectsQuery,
} from '@/api/generated/insurance';
import { isStaff } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { type CoverState, coverState, FRESH } from './insurance-utils';
import { CoverPill } from './status';
import { useDistrictName, useProduceName } from './use-names';

const PAGE_SIZE = 12;
type Tab = 'all' | CoverState;
/** An insurer has no unassigned projects: only theirs are listed. */
const OFFICE_TABS: readonly Tab[] = [
  'all',
  'unassigned',
  'no_cover',
  'covered',
];
const INSURER_TABS: readonly Tab[] = ['all', 'no_cover', 'covered'];

/**
 * Insured projects with the crop in the field: who insures each and the
 * cover set. Admins assign insurers here; an insurer sees the projects
 * assigned to them. Searched by title words or the farmer.
 */
export function InsuredProjectsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const sees = isStaff(role) && role !== 'field_officer';
  const insurer = role === 'insurer';
  const tabs = insurer ? INSURER_TABS : OFFICE_TABS;
  const tab = tabs.find((x) => x === search.tab) ?? 'all';
  const page = search.page ?? 1;
  const query = useInsuranceInsuredProjectsQuery(
    {
      page,
      limit: PAGE_SIZE,
      q: search.q,
      ...(tab === 'all' ? {} : { cover: tab }),
    },
    { ...FRESH, skip: !sees && !insurer },
  );
  // Officers and farmers follow claims; the list of projects is not theirs.
  if (!sees && !insurer) return <Navigate to="/insurance/claims" replace />;
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/insurance',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.insuredProjects')}
        description={t(
          `insurance.projectsIntro.${insurer ? 'insurer' : 'office'}`,
        )}
      />
      <div
        role="tablist"
        aria-label={t('market.tabs')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {tabs.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => set({ tab: x === 'all' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`insurance.projectTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('insurance.searchProjects')}
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
          icon={ShieldCheck}
          title={
            search.q ? t('insurance.noProjectMatch') : t('insurance.noProjects')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((p) => (
              <li key={p.project.id}>
                <InsuredProjectCard project={p} />
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
                  to: '/insurance',
                  search: { ...search, page: p },
                })
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function InsuredProjectCard({ project: p }: { project: InsuredProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const produce = useProduceName();
  const district = useDistrictName();
  const state = coverState(p);
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          <Link
            to="/insurance/projects/$projectId"
            params={{ projectId: p.project.id }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {p.project.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {produce(p.produceCode)} · {district(p.district)}
        </p>
      </div>
      <p className="truncate text-sm">
        <span className="text-muted-foreground">{t('insurance.farmer')}: </span>
        <span className="font-medium">{p.farmer.name}</span>
      </p>
      <p className="truncate text-sm">
        <span className="text-muted-foreground">
          {t('insurance.insurer')}:{' '}
        </span>
        <span className="font-medium">
          {p.insurer?.name ?? t('insurance.noInsurer')}
        </span>
        {p.maxAmount && (
          <span className="text-muted-foreground">
            {' · '}
            {t('insurance.upTo', { amount: fmt.taka(p.maxAmount) })}
          </span>
        )}
      </p>
      <span className="flex flex-wrap gap-1.5">
        <CoverPill state={state} />
      </span>
    </article>
  );
}
