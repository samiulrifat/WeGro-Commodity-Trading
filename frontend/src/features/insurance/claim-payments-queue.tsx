import { useNavigate } from '@tanstack/react-router';
import { HandCoins, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  useClaimProofsListQuery,
  useInsuranceListClaimsQuery,
} from '@/api/generated/insurance';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { cn } from '@/lib/utils';
import { ClaimProofCard } from './claim-payment';
import { ClaimCard } from './claims-list';
import { FRESH } from './insurance-utils';

const PAGE_SIZE = 20;
const TABS = ['pending', 'accepted', 'rejected', 'claims'] as const;
type Tab = (typeof TABS)[number];

/**
 * Accounts' review of insurers' payments for approved claims: proofs
 * waiting (oldest first), decided ones, and claims still awaiting payment.
 * Proofs are searched by the insurer's name words, number or NID; claims by
 * project, event type or farmer.
 */
export function ClaimPaymentsQueue({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tab: Tab = TABS.find((x) => x === search.tab) ?? 'pending';
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/insurance/payments',
      search: { ...search, ...patch, page: undefined },
    });
  const onPage = (page: number) =>
    void navigate({
      to: '/insurance/payments',
      search: { ...search, page },
    });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.insurerPayments')}
        description={t('insurance.payments.intro')}
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
            {t(`insurance.payments.tab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        key={tab}
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={
          tab === 'claims'
            ? t('insurance.searchClaims')
            : t('insurance.payments.search')
        }
      />
      {tab === 'claims' ? (
        <AwaitingClaims search={search} onPage={onPage} />
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
  const query = useClaimProofsListQuery({
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
          search.q
            ? t('people.noMatch')
            : t(`insurance.payments.none.${status}`)
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
            <ClaimProofCard proof={p} />
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

/** Approved claims not yet paid; each opens the claim, where Accounts acts on it. */
function AwaitingClaims({ search, onPage }: ListProps) {
  const { t } = useTranslation();
  const page = search.page ?? 1;
  const query = useInsuranceListClaimsQuery(
    { paymentDue: true, q: search.q, page, limit: PAGE_SIZE },
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
        title={
          search.q ? t('people.noMatch') : t('insurance.payments.none.claims')
        }
      />
    );
  }
  const meta = query.data?.meta;
  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((c) => (
          <li key={c.id}>
            <ClaimCard claim={c} />
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
