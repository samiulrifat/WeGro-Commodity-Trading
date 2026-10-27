import { Link, useNavigate } from '@tanstack/react-router';
import { Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ProjectDto,
  useProjectsListQuery,
} from '@/api/generated/projects';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { StagePill } from '@/features/projects/stage-pill';
import { cn } from '@/lib/utils';
import { FRESH } from './payouts-utils';
import { useDistrictName } from '@/features/insurance/use-names';

const PAGE_SIZE = 12;
/** Projects with money to settle: costs while funded, payouts once active. */
const TABS = ['ready_for_sale', 'active', 'funded', 'paid_out'] as const;
type Tab = (typeof TABS)[number];

/**
 * Projects to settle, by stage: ready for sale ones wait for their final
 * payout, active ones may have staged payouts. Searched by title, place or
 * crop.
 */
export function SettleProjectsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tab: Tab = TABS.find((x) => x === search.tab) ?? TABS[0];
  const page = search.page ?? 1;
  const query = useProjectsListQuery(
    { page, limit: PAGE_SIZE, q: search.q, stage: tab },
    FRESH,
  );
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/payouts/projects',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.settleProjects')}
        description={t('payouts.projectsIntro')}
      />
      <div
        role="tablist"
        aria-label={t('market.tabs')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => set({ tab: x === TABS[0] ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`payouts.projectTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('payouts.searchProjects')}
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
          icon={Sprout}
          title={
            search.q ? t('payouts.noProjectMatch') : t('payouts.noProjects')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} />
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
                  to: '/payouts/projects',
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

function ProjectCard({ project: p }: { project: ProjectDto }) {
  const districtName = useDistrictName();
  const { i18n } = useTranslation();
  const produce =
    i18n.resolvedLanguage === 'bn' && p.produce.nameBn
      ? p.produce.nameBn
      : p.produce.name;
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          <Link
            to="/payouts/projects/$projectId"
            params={{ projectId: p.id }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {p.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {produce} · {districtName(p.district)}
        </p>
      </div>
      <p className="truncate text-sm font-medium">{p.farmer.fullName}</p>
      <span className="flex flex-wrap gap-1.5">
        <StagePill stage={p.stage} />
      </span>
    </article>
  );
}
