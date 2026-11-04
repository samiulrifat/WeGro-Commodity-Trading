import { Link, useNavigate } from '@tanstack/react-router';
import { HandCoins, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type DealProofDto,
  useDealProofsListQuery,
  useDealProofsRefundMutation,
  useTradeListOffersQuery,
} from '@/api/generated/marketplace';
import { actsAs } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { RefundDialog } from '@/features/projects/refunds-page';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { DealProofCard } from './deal-payment';
import { DealCard } from './deals-list';
import { FRESH, type MarketSearch } from './market-utils';

const PAGE_SIZE = 20;
const TABS = ['pending', 'accepted', 'rejected', 'deals', 'refunds'] as const;
type Tab = (typeof TABS)[number];

/**
 * Accounts' review of buyers' payments: proofs waiting (oldest first),
 * decided ones, deals still awaiting payment, and money to give back for
 * deals that ended unpaid. Searched by the buyer's name words, number or NID.
 */
export function DealPaymentsQueue({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tab: Tab = TABS.find((x) => x === search.tab) ?? 'pending';
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/marketplace/payments',
      search: { ...search, ...patch, page: undefined },
    });
  const onPage = (page: number) =>
    void navigate({
      to: '/marketplace/payments',
      search: { ...search, page },
    });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.dealPayments')}
        description={t('market.payments.intro')}
      />
      <div
        role="tablist"
        aria-label={t('payments.tabs')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => set({ tab: x === 'pending' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`market.payments.tab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        key={tab}
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('market.payments.search')}
      />
      {tab === 'deals' ? (
        <AwaitingDeals search={search} onPage={onPage} />
      ) : tab === 'refunds' ? (
        <RefundsDue search={search} onPage={onPage} />
      ) : (
        <Proofs status={tab} search={search} onPage={onPage} />
      )}
    </div>
  );
}

type ListProps = { search: MarketSearch; onPage: (page: number) => void };

function Proofs({
  status,
  search,
  onPage,
}: ListProps & { status: 'pending' | 'accepted' | 'rejected' }) {
  const { t } = useTranslation();
  const page = search.page ?? 1;
  const query = useDealProofsListQuery({
    status,
    q: search.q,
    page,
    limit: PAGE_SIZE,
  });
  if (query.isLoading) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data?.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={
          search.q ? t('people.noMatch') : t(`market.payments.none.${status}`)
        }
        description={search.q ? t('people.noMatchHint') : undefined}
      />
    );
  }
  const meta = query.data?.meta;
  return (
    <>
      <ul className="grid gap-4 xl:grid-cols-2">
        {rows.map((p) => (
          <li key={p.id}>
            <DealProofCard proof={p} />
          </li>
        ))}
      </ul>
      {meta && (
        <Pager
          page={page}
          pages={meta.totalPages}
          total={meta.total}
          onPage={onPage}
        />
      )}
    </>
  );
}

/** Approved deals not yet paid; each opens the deal, where Accounts acts on it. */
function AwaitingDeals({ search, onPage }: ListProps) {
  const { t } = useTranslation();
  const page = search.page ?? 1;
  const query = useTradeListOffersQuery(
    { status: 'approved', q: search.q, page, limit: PAGE_SIZE },
    FRESH,
  );
  if (query.isLoading) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data?.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title={search.q ? t('people.noMatch') : t('market.payments.none.deals')}
      />
    );
  }
  const meta = query.data?.meta;
  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((o) => (
          <li key={o.id}>
            <DealCard offer={o} />
          </li>
        ))}
      </ul>
      {meta && (
        <Pager
          page={page}
          pages={meta.totalPages}
          total={meta.total}
          onPage={onPage}
        />
      )}
    </>
  );
}

/** Money accepted for deals that then ended unpaid: Accounts records each transfer back. */
function RefundsDue({ search, onPage }: ListProps) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const page = search.page ?? 1;
  const query = useDealProofsListQuery({
    refund: 'due',
    q: search.q,
    page,
    limit: PAGE_SIZE,
  });
  const [refund] = useDealProofsRefundMutation();
  const [recording, setRecording] = useState<DealProofDto | null>(null);
  if (query.isLoading) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data?.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title={
          search.q ? t('people.noMatch') : t('market.payments.none.refunds')
        }
      />
    );
  }
  const meta = query.data?.meta;
  return (
    <>
      <ul className="divide-y rounded-2xl border bg-card px-4">
        {rows.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="grid gap-0.5">
              <span className="font-semibold">{p.buyer.fullName}</span>
              <Link
                to="/marketplace/deals/$offerId"
                params={{ offerId: String(p.offerId) }}
                className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
              >
                {t('market.offerNumber', { id: p.offerId })} ·{' '}
                {t(`market.offerStatus.${p.dealStatus}`)}
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold">{fmt.taka(p.amount)}</span>
              {actsAs(role, 'accounts') && (
                <Button variant="outline" onClick={() => setRecording(p)}>
                  {t('refunds.record')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {meta && (
        <Pager
          page={page}
          pages={meta.totalPages}
          total={meta.total}
          onPage={onPage}
        />
      )}
      {recording && (
        <RefundDialog
          amount={recording.amount}
          name={recording.buyer.fullName}
          onClose={() => setRecording(null)}
          onRecord={(ref) =>
            refund({
              id: recording.id,
              proofRefundDto: { paymentReference: ref },
            }).unwrap()
          }
        />
      )}
    </>
  );
}
