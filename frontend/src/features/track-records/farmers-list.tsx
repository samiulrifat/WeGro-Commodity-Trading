import { Link, useNavigate } from '@tanstack/react-router';
import { BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type TrackRecordFarmerDto,
  useTrackRecordTrackRecordFarmersQuery,
} from '@/api/generated/track-record';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { useDistrictName } from '@/features/insurance/use-names';

const PAGE_SIZE = 12;
const TABS = [
  'all',
  'pending_additions',
  'published',
  'not_published',
] as const;

/**
 * Farmers and where their track records stand: the latest published
 * version, finished projects it does not hold yet, and how many banks may
 * see it. Officers see their own farmers.
 */
export function FarmersList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const tab = TABS.find((x) => x === search.tab) ?? 'all';
  const page = search.page ?? 1;
  const query = useTrackRecordTrackRecordFarmersQuery(
    {
      page,
      limit: PAGE_SIZE,
      q: search.q,
      ...(tab === 'all' ? {} : { state: tab }),
    },
    { refetchOnMountOrArgChange: true },
  );
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/track-records',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.farmerRecords')}
        description={t(
          `trackRecords.farmersIntro.${role === 'field_officer' ? 'officer' : 'office'}`,
        )}
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
            onClick={() => set({ tab: x === 'all' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`trackRecords.farmerTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('trackRecords.searchFarmers')}
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
          icon={BadgeCheck}
          title={
            search.q
              ? t('trackRecords.noFarmerMatch')
              : t('trackRecords.noFarmers')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((f) => (
              <li key={f.farmer.id}>
                <FarmerCard farmer={f} />
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
                  to: '/track-records',
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

function FarmerCard({ farmer: f }: { farmer: TrackRecordFarmerDto }) {
  const districtName = useDistrictName();
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          <Link
            to="/track-records/farmers/$farmerId"
            params={{ farmerId: f.farmer.id }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {f.farmer.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {[
            districtName(f.district),
            f.officer && t('trackRecords.officerIs', { name: f.officer.name }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <p className="text-sm">
        {t('trackRecords.finishedProjects', {
          count: f.finishedProjects,
          n: fmt.number(f.finishedProjects),
        })}
        {' · '}
        {t('trackRecords.banksMaySee', {
          count: f.currentPermissions,
          n: fmt.number(f.currentPermissions),
        })}
      </p>
      <span className="flex flex-wrap gap-1.5">
        {f.latestVersion ? (
          <StatusPill tone="success" appearance="soft">
            {t('trackRecords.versionOn', {
              version: f.latestVersion,
              date: f.publishedAt ? fmt.date(f.publishedAt) : '',
            })}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" appearance="soft">
            {t('trackRecords.notPublished')}
          </StatusPill>
        )}
        {f.pendingProjects > 0 && (
          <StatusPill tone="warning" appearance="soft">
            {t('trackRecords.pendingProjects', {
              count: f.pendingProjects,
              n: fmt.number(f.pendingProjects),
            })}
          </StatusPill>
        )}
      </span>
    </article>
  );
}
