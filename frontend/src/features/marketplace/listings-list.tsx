import { Link, useNavigate } from '@tanstack/react-router';
import { ImageOff, PackagePlus, Store } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type ListingDto,
  type TradeListListingsApiArg,
  useTradeListListingsQuery,
} from '@/api/generated/marketplace';
import { actsAs, isStaff } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  FRESH,
  knownDistrict,
  type MarketSearch,
  produceName,
  sellerName,
} from './market-utils';
import { NewListingDialog, SellerListingDialog } from './new-listing-dialog';
import { ListingStatus } from './status';

const PAGE_SIZE = 12;

/** The lists of listings: everyone's, a seller's own, and those awaiting approval. */
export type ListingsMode = 'browse' | 'mine' | 'approvals';

type ListingTab =
  'all' | 'warehouse' | 'fresh' | 'seller' | ListingDto['status'];

const TABS: Record<ListingsMode, readonly ListingTab[]> = {
  browse: ['all', 'warehouse', 'fresh', 'seller'],
  mine: ['all', 'pending', 'open', 'sold_out', 'rejected', 'cancelled'],
  approvals: ['pending', 'rejected'],
};
/** Staff may also look back at closed listings. */
const STAFF_TABS: readonly ListingTab[] = [
  ...TABS.browse,
  'sold_out',
  'cancelled',
];
const PATH = {
  browse: '/marketplace',
  mine: '/marketplace/mine',
  approvals: '/marketplace/approvals',
} as const;
const TITLE = {
  browse: 'nav.sub.listings',
  mine: 'nav.sub.myListings',
  approvals: 'nav.sub.listingApprovals',
} as const;

/** What a tab asks the API for. */
function filter(mode: ListingsMode, tab: ListingTab): TradeListListingsApiArg {
  if (mode === 'mine') {
    return tab === 'all'
      ? { mine: true }
      : { mine: true, status: tab as ListingDto['status'] };
  }
  if (mode === 'approvals') {
    return { source: 'seller', status: tab as ListingDto['status'] };
  }
  if (tab === 'sold_out' || tab === 'cancelled') return { status: tab };
  return tab === 'all' ? {} : { source: tab as ListingDto['source'] };
}

/**
 * Listings as cards: what is for sale, how much is left, at what price,
 * from whom. Tabs by where the goods come from (or by status), searched by
 * produce, project or seller.
 */
export function ListingsList({
  search,
  mode,
}: {
  search: MarketSearch;
  mode: ListingsMode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [adding, setAdding] = useState(false);
  const tabs = mode === 'browse' && isStaff(role) ? STAFF_TABS : TABS[mode];
  const tab = tabs.find((x) => x === search.tab) ?? tabs[0]!;
  const page = search.page ?? 1;
  const query = useTradeListListingsQuery(
    {
      page,
      limit: PAGE_SIZE,
      q: search.q,
      ...filter(mode, tab),
    },
    FRESH,
  );
  const path = PATH[mode];
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const seller = role === 'seller';
  const lists = actsAs(role, 'admin') || role === 'field_officer' || seller;
  const intro =
    mode === 'browse'
      ? t(`market.intro.${introKey(role)}`)
      : t(`market.intro.${mode}`);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t(TITLE[mode])}
        description={intro}
        actions={
          lists &&
          mode !== 'approvals' && (
            <Button onClick={() => setAdding(true)}>
              <PackagePlus /> {t('market.newListing')}
            </Button>
          )
        }
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
            {t(`market.listingTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('market.searchListings')}
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
          icon={Store}
          title={
            search.q
              ? t('market.noListingMatch')
              : mode === 'approvals'
                ? t('market.noApprovals')
                : t('market.noListings')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((l) => (
              <li key={l.id}>
                <ListingCard listing={l} />
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
      {adding &&
        (seller ? (
          <SellerListingDialog onClose={() => setAdding(false)} />
        ) : (
          <NewListingDialog onClose={() => setAdding(false)} />
        ))}
    </div>
  );
}

const introKey = (role: string) =>
  role === 'buyer'
    ? 'buyer'
    : role === 'seller'
      ? 'seller'
      : role === 'farmer'
        ? 'farmer'
        : role === 'field_officer'
          ? 'officer'
          : role === 'warehouse'
            ? 'operator'
            : 'office';

/** The first photo of an outside seller's listing, small. */
export function ListingThumb({
  listing: l,
  className,
}: {
  listing: ListingDto;
  className?: string;
}) {
  const { t } = useTranslation();
  const { url, error } = useApiFile(l.photos[0]);
  if (l.photos.length === 0) return null;
  return url ? (
    <img
      src={url}
      alt={t('market.photoAlt', { n: 1 })}
      className={cn('rounded-xl bg-muted object-cover', className)}
    />
  ) : (
    <div
      className={cn(
        'grid place-items-center rounded-xl bg-muted text-muted-foreground',
        !error && 'animate-pulse',
        className,
      )}
    >
      {error && <ImageOff aria-hidden className="size-5" />}
    </div>
  );
}

/** One listing: produce, what is left of how much, price, seller, place. */
export function ListingCard({ listing: l }: { listing: ListingDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <article className="relative flex gap-4 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <ListingThumb listing={l} className="size-20 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="grid gap-0.5">
          <h3 className="font-bold leading-snug">
            <Link
              to="/marketplace/listings/$listingId"
              params={{ listingId: String(l.id) }}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {produceName(l.produce, bengali)} ·{' '}
              {t('market.perUnit', {
                price: fmt.taka(l.askingUnitPrice),
                unit: l.produce.unit,
              })}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('market.listingNumber', { id: l.id })} ·{' '}
            {t('market.availableOf', {
              available: fmt.number(l.available),
              quantity: fmt.number(l.quantity),
              unit: l.produce.unit,
            })}
          </p>
        </div>
        <p className="truncate text-sm">
          <span className="font-medium">
            {sellerName(l, t('market.wegro'))}
          </span>
          <span className="text-muted-foreground">
            {' · '}
            {knownDistrict(l.district.code)
              ? t(`districts.${l.district.code}`)
              : l.district.name}
          </span>
        </p>
        <ListingStatus listing={l} />
      </div>
    </article>
  );
}
