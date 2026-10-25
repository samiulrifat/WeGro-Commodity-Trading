import { Link, useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ConsentDto,
  useTrackRecordAllConsentsQuery,
} from '@/api/generated/track-record';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { ConsentStatusPill } from './consent-status';

const PAGE_SIZE = 20;
const TABS = ['current', 'expired', 'revoked', 'all'] as const;

/**
 * Bank permissions across farmers: which bank may see whose track record,
 * until when, given on which signed form, and how often it looked.
 */
export function PermissionsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tab = TABS.find((x) => x === search.tab) ?? 'current';
  const page = search.page ?? 1;
  const query = useTrackRecordAllConsentsQuery(
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
      to: '/track-records/permissions',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.bankPermissions')}
        description={t('trackRecords.permissionsIntro')}
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
            onClick={() => set({ tab: x === 'current' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`trackRecords.permissionTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('trackRecords.searchPermissions')}
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
          icon={KeyRound}
          title={
            search.q
              ? t('trackRecords.noPermissionMatch')
              : t('trackRecords.noPermissions')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {query.data.data.map((c) => (
              <li key={c.id}>
                <PermissionRow consent={c} />
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
                  to: '/track-records/permissions',
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

function PermissionRow({ consent: c }: { consent: ConsentDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="grid min-w-0 gap-0.5">
        <p className="font-medium">
          <Link
            to="/track-records/farmers/$farmerId"
            params={{ farmerId: c.farmer.id }}
            className="hover:underline"
          >
            {c.farmer.name}
          </Link>
          {' → '}
          {c.bank.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('trackRecords.untilDay', { date: fmt.date(c.expiresOn) })} ·{' '}
          {t('trackRecords.grantedBy', { name: c.grantedBy.name })} ·{' '}
          {t('trackRecords.views', { count: c.views, n: fmt.number(c.views) })}
        </p>
      </div>
      <ConsentStatusPill consent={c} />
    </div>
  );
}
