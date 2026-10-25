import { Link, useNavigate } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  useTrackRecordBankFarmersQuery,
  useTrackRecordMyBankQuery,
} from '@/api/generated/track-record';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

/**
 * A bank officer's farmers: those whose permission for this bank is
 * current, until their last day. Opening one is logged on the ledger.
 */
export function BankFarmersList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const bank = useTrackRecordMyBankQuery();
  const page = search.page ?? 1;
  const query = useTrackRecordBankFarmersQuery(
    { page, limit: PAGE_SIZE, q: search.q },
    { refetchOnMountOrArgChange: true, skip: bank.data?.data.bank === null },
  );
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/bank/farmers',
      search: { ...search, ...patch, page: undefined },
    });
  const myBank = bank.data?.data.bank;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.farmers')}
        description={
          myBank
            ? t('trackRecords.bankIntro', {
                bank: `${myBank.name}, ${myBank.branchName}`,
              })
            : t('trackRecords.bankIntroNone')
        }
      />
      {bank.data && !myBank && (
        <Alert>
          <AlertDescription>{t('trackRecords.noBankYet')}</AlertDescription>
        </Alert>
      )}
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('trackRecords.searchFarmers')}
      />
      {(query.isLoading || bank.isLoading) && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon={Users}
          title={
            search.q
              ? t('trackRecords.noFarmerMatch')
              : t('trackRecords.noBankFarmers')
          }
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {query.data.data.map((f) => {
              const row = (
                <>
                  <span className="grid gap-0.5">
                    <span className="font-medium">{f.farmer.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        f.district,
                        t('trackRecords.untilDay', {
                          date: fmt.date(f.expiresOn),
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="text-sm">
                    {f.latestVersion
                      ? t('trackRecords.versionShort', {
                          version: f.latestVersion,
                        })
                      : t('trackRecords.notPublished')}
                  </span>
                </>
              );
              const layout =
                'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3';
              return (
                <li key={f.farmer.id}>
                  {/* Nothing to open (or log) before a version is published. */}
                  {f.latestVersion ? (
                    <Link
                      to="/bank/farmers/$farmerId"
                      params={{ farmerId: f.farmer.id }}
                      className={cn(
                        layout,
                        'outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
                      )}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className={cn(layout, 'text-muted-foreground')}>
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager
            page={page}
            pages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPage={(p) =>
              void navigate({
                to: '/bank/farmers',
                search: { ...search, page: p },
              })
            }
          />
        </>
      )}
    </div>
  );
}
