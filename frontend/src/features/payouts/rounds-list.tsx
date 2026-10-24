import { Link, useNavigate } from '@tanstack/react-router';
import { Banknote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type RoundListItemDto,
  useSettlementListRoundsQuery,
} from '@/api/generated/settlement';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { FRESH, payoutTotal, type RoundStatus } from './payouts-utils';
import { RoundKindPill, RoundStatusPill } from './status';

const PAGE_SIZE = 12;
type Tab = 'all' | RoundStatus;
const TABS: readonly Tab[] = [
  'all',
  'prepared',
  'approved',
  'paid',
  'rejected',
];
/** Accounts start where their work is: rounds to approve. */
const ACCOUNTS_TABS: readonly Tab[] = [
  'prepared',
  'approved',
  'all',
  'paid',
  'rejected',
];

/**
 * Payout rounds across projects: prepared by one Accounts person, approved
 * by another, then paid line by line. Tabbed by status and searched by
 * round number or project title.
 */
export function RoundsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const tabs = role === 'accounts' ? ACCOUNTS_TABS : TABS;
  const tab = tabs.find((x) => x === search.tab) ?? tabs[0]!;
  const page = search.page ?? 1;
  const query = useSettlementListRoundsQuery(
    {
      page,
      limit: PAGE_SIZE,
      q: search.q,
      ...(tab === 'all' ? {} : { status: tab }),
    },
    FRESH,
  );
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/payouts',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.payoutRounds')}
        description={t('payouts.roundsIntro')}
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
            onClick={() => set({ tab: x === tabs[0] ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`payouts.roundTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('payouts.searchRounds')}
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
          icon={Banknote}
          title={search.q ? t('payouts.noRoundMatch') : t('payouts.noRounds')}
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((r) => (
              <li key={r.id}>
                <RoundCard round={r} />
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
                  to: '/payouts',
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

/** One round: which project, what it pays out, how far its payments are. */
function RoundCard({ round: r }: { round: RoundListItemDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          <Link
            to="/payouts/rounds/$roundId"
            params={{ roundId: String(r.id) }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {t('payouts.roundNumber', { id: r.id })} · {r.project.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('payouts.preparedBy', {
            name: r.preparedBy.name,
            date: fmt.date(r.preparedAt),
          })}
        </p>
      </div>
      <p className="text-sm">
        <span className="font-semibold">{fmt.taka(payoutTotal(r))}</span>
        <span className="text-muted-foreground">
          {' · '}
          {t('payouts.paidOf', {
            paid: fmt.number(r.paidCount),
            count: r.payeeCount,
            total: fmt.number(r.payeeCount),
          })}
        </span>
      </p>
      <span className="flex flex-wrap gap-1.5">
        <RoundStatusPill status={r.status} />
        <RoundKindPill isFinal={r.isFinal} />
      </span>
    </article>
  );
}

/** A round in a project's list. */
export function RoundRow({
  round: r,
}: {
  round: {
    id: number;
    isFinal: boolean;
    status: RoundStatus;
    profit: string;
    capitalReturn: string;
    preparedAt: string;
  };
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Link
      to="/payouts/rounds/$roundId"
      params={{ roundId: String(r.id) }}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="grid gap-0.5">
        <span className="font-medium">
          {t('payouts.roundNumber', { id: r.id })} ·{' '}
          {r.isFinal ? t('payouts.final') : t('payouts.staged')}
        </span>
        <span className="text-sm text-muted-foreground">
          {fmt.date(r.preparedAt)} ·{' '}
          {t('payouts.profitShort', { amount: fmt.taka(r.profit) })}
        </span>
      </span>
      <RoundStatusPill status={r.status} />
    </Link>
  );
}
