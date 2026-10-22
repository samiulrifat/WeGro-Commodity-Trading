import { Link, useNavigate } from '@tanstack/react-router';
import { HandCoins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type OfferDto,
  type TradeListOffersApiArg,
  useTradeListOffersQuery,
} from '@/api/generated/marketplace';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { FRESH, type MarketSearch, produceName } from './market-utils';
import { OfferStatus } from './status';

const PAGE_SIZE = 12;

/**
 * Offers and deals: everyone's in the role's reach, a buyer's own, those
 * waiting for delivery, and outside sellers' deals waiting for their payout.
 */
export type DealsMode = 'deals' | 'mine' | 'deliveries' | 'payouts';

type DealTab =
  | 'all'
  | 'pending'
  | 'approved'
  | 'paid'
  | 'delivered'
  | 'seller_paid'
  | 'mismatch'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'withdrawn'
  | 'due';

const ALL_TABS: readonly DealTab[] = [
  'all',
  'pending',
  'approved',
  'paid',
  'delivered',
  'seller_paid',
  'mismatch',
  'rejected',
  'cancelled',
  'expired',
  'withdrawn',
];
const TABS: Record<DealsMode, readonly DealTab[]> = {
  deals: ALL_TABS,
  mine: ALL_TABS,
  deliveries: ['paid', 'mismatch', 'delivered'],
  payouts: ['due', 'seller_paid'],
};
const PATH = {
  deals: '/marketplace/deals',
  mine: '/offers',
  deliveries: '/marketplace/deliveries',
  payouts: '/marketplace/payouts',
} as const;
const TITLE = {
  deals: 'nav.sub.deals',
  mine: 'nav.offers',
  deliveries: 'nav.sub.deliveries',
  payouts: 'nav.sub.sellerPayouts',
} as const;

/** What a tab asks the API for. */
function filter(tab: DealTab): Partial<TradeListOffersApiArg> {
  if (tab === 'all') return {};
  if (tab === 'mismatch') return { discrepancy: true };
  if (tab === 'due') return { payoutDue: true };
  return { status: tab as OfferDto['status'] };
}

/** Offers and deals as cards, tabbed by where they stand and searched. */
export function DealsList({
  search,
  mode,
}: {
  search: MarketSearch;
  mode: DealsMode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const tabs = TABS[mode];
  const tab = tabs.find((x) => x === search.tab) ?? tabs[0]!;
  const page = search.page ?? 1;
  const query = useTradeListOffersQuery(
    { page, limit: PAGE_SIZE, q: search.q, ...filter(tab) },
    FRESH,
  );
  const path = PATH[mode];
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const intro =
    mode === 'deals'
      ? t(`market.dealsIntro.${introKey(role)}`)
      : t(`market.intro.${mode}`);

  return (
    <div className="grid gap-6">
      <PageHeader title={t(TITLE[mode])} description={intro} />
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
            {t(`market.dealTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('market.searchDeals')}
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
          icon={HandCoins}
          title={search.q ? t('market.noDealMatch') : t('market.noDeals')}
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((o) => (
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

const introKey = (role: string) =>
  role === 'seller'
    ? 'seller'
    : role === 'farmer'
      ? 'farmer'
      : role === 'field_officer'
        ? 'officer'
        : role === 'warehouse'
          ? 'operator'
          : 'office';

/** One offer or deal: produce, quantity at price, buyer and seller, what it costs. */
export function DealCard({ offer: o }: { offer: OfferDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          <Link
            to="/marketplace/deals/$offerId"
            params={{ offerId: String(o.id) }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {produceName(o.produce, i18n.resolvedLanguage === 'bn')} ·{' '}
            {t('warehouse.quantityOf', {
              quantity: fmt.number(o.quantity),
              unit: o.produce.unit,
            })}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('market.offerNumber', { id: o.id })} ·{' '}
          {t('market.perUnit', {
            price: fmt.taka(o.unitPrice),
            unit: o.produce.unit,
          })}
        </p>
      </div>
      <p className="truncate text-sm">
        <span className="font-medium">{o.buyer.name}</span>
        <span className="text-muted-foreground">
          {' '}
          ← {o.seller.kind === 'wegro' ? t('market.wegro') : o.seller.name}
        </span>
      </p>
      <p className="text-sm">
        <span className="font-semibold">
          {fmt.taka(o.buyerPays ?? o.amount)}
        </span>
        {o.paymentDueAt && o.status === 'approved' && (
          <span className="text-muted-foreground">
            {' · '}
            {t('market.payBy', { date: fmt.dateTime(o.paymentDueAt) })}
          </span>
        )}
      </p>
      <OfferStatus offer={o} />
    </article>
  );
}

/** An offer in a listing's list: who, how much at what price, where it stands. */
export function OfferRow({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Link
      to="/marketplace/deals/$offerId"
      params={{ offerId: String(o.id) }}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="font-medium">
          {t('market.offerNumber', { id: o.id })} · {o.buyer.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {t('warehouse.quantityOf', {
            quantity: fmt.number(o.quantity),
            unit: o.produce.unit,
          })}{' '}
          ·{' '}
          {t('market.perUnit', {
            price: fmt.taka(o.unitPrice),
            unit: o.produce.unit,
          })}{' '}
          · {fmt.taka(o.amount)}
        </span>
      </span>
      <OfferStatus offer={o} />
    </Link>
  );
}
