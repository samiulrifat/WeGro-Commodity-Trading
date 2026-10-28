import { Link, useNavigate } from '@tanstack/react-router';
import { Megaphone, Plus } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import {
  type BuyerRequestDto,
  useTradeCancelRequestMutation,
  useTradeListRequestsQuery,
  useTradePostRequestMutation,
} from '@/api/generated/marketplace';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { typedTaka } from '@/features/projects/project-math';
import { dayAfter } from '@/features/warehouse/receipt-utils';
import { useFormat } from '@/i18n/use-format';
import { todayBd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  FRESH,
  type MarketSearch,
  produceName,
  validQuantity,
  wholeNumber,
} from './market-utils';
import { useUnit } from '@/i18n/use-unit';
import { useDistrictName } from '@/features/insurance/use-names';

const PAGE_SIZE = 12;
const TABS = ['open', 'all'] as const;
const TONE = {
  open: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
} as const;

/**
 * What buyers want to buy: produce, how much, the most they would pay and
 * until when, each with the open listings that already match. Buyers see
 * and manage their own (`mine`); sellers and WeGro see everyone's.
 */
export function RequestsList({
  search,
  mine = false,
}: {
  search: MarketSearch;
  mine?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [posting, setPosting] = useState(false);
  const tab = search.tab === 'all' ? 'all' : 'open';
  const page = search.page ?? 1;
  const query = useTradeListRequestsQuery(
    {
      page,
      limit: PAGE_SIZE,
      q: search.q,
      ...(tab === 'all' ? { includeClosed: true } : {}),
      ...(mine ? { mine: true } : {}),
    },
    FRESH,
  );
  const path = mine ? '/requests' : '/marketplace/requests';
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={mine ? t('nav.requests') : t('nav.sub.buyerRequests')}
        description={
          mine ? t('market.intro.myRequests') : t('market.intro.requests')
        }
        actions={
          mine && (
            <Button onClick={() => setPosting(true)}>
              <Plus /> {t('market.postRequest')}
            </Button>
          )
        }
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
            onClick={() => set({ tab: x === 'open' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`market.requestTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={
          mine ? t('market.searchMyRequests') : t('market.searchRequests')
        }
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
          icon={Megaphone}
          title={search.q ? t('market.noRequestMatch') : t('market.noRequests')}
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((r) => (
              <li key={r.id}>
                <RequestCard request={r} />
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
      {posting && <PostRequestDialog onClose={() => setPosting(false)} />}
    </div>
  );
}

function RequestCard({ request: r }: { request: BuyerRequestDto }) {
  const districtName = useDistrictName();
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const [cancelling, setCancelling] = useState(false);
  const own = user.role === 'buyer' && r.buyer.id === user.id;
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          {produceName(r.produce, i18n.resolvedLanguage === 'bn')} ·{' '}
          {t('warehouse.quantityOf', {
            quantity: fmt.number(r.quantity),
            unit: r.produce.unit,
          })}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('market.upToPrice', {
            price: fmt.taka(r.maxUnitPrice),
            unit: r.produce.unit,
          })}{' '}
          · {t('market.openUntil', { date: fmt.date(r.validUntil) })}
        </p>
      </div>
      <p className="truncate text-sm">
        <span className="font-medium">{r.buyer.name}</span>
        <span className="text-muted-foreground">
          {' · '}
          {t('market.postedOn', { date: fmt.date(r.postedAt) })}
        </span>
      </p>
      <span className="flex flex-wrap gap-1.5">
        <StatusPill tone={TONE[r.status]} appearance="soft">
          {t(`market.requestStatus.${r.status}`)}
        </StatusPill>
      </span>
      {r.status === 'open' && (
        <div className="grid gap-1.5">
          <p className="text-sm font-semibold">
            {r.matchingListings.length === 0
              ? t('market.noMatches')
              : t('market.matches', { count: r.matchingListings.length })}
          </p>
          {r.matchingListings.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {r.matchingListings.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/marketplace/listings/$listingId"
                    params={{ listingId: String(m.id) }}
                    className="inline-flex min-h-11 items-center rounded-full border px-3 text-sm hover:bg-muted"
                  >
                    {t('market.listingNumber', { id: m.id })} ·{' '}
                    {t('market.perUnit', {
                      price: fmt.taka(m.askingUnitPrice),
                      unit: r.produce.unit,
                    })}{' '}
                    · {fmt.number(m.available)} · {districtName(m.district)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {own && r.status === 'open' && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => setCancelling(true)}
        >
          {t('market.cancelRequest')}
        </Button>
      )}
      {cancelling && (
        <CancelRequestDialog request={r} onClose={() => setCancelling(false)} />
      )}
    </article>
  );
}

function CancelRequestDialog({
  request: r,
  onClose,
}: {
  request: BuyerRequestDto;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const [cancel, cancelling] = useTradeCancelRequestMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await cancel({ id: r.id }).unwrap();
      toast.success(t('market.requestCancelled'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('market.cancelRequest')}</DialogTitle>
          <DialogDescription>
            {t('market.cancelRequestText', {
              produce: produceName(r.produce, i18n.resolvedLanguage === 'bn'),
              quantity: fmt.number(r.quantity),
              unit: r.produce.unit,
            })}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('market.keep')}
          </Button>
          <Button
            variant="destructive"
            disabled={cancelling.isLoading}
            onClick={() => void go()}
          >
            {cancelling.isLoading
              ? t('people.actions.working')
              : t('market.cancelRequest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A buyer says what they want: produce, how much, the most per unit, until when. */
function PostRequestDialog({ onClose }: { onClose: () => void }) {
  const unitWord = useUnit();
  const { t, i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  const catalog = useCatalogGetQuery({});
  const [post, posting] = useTradePostRequestMutation();
  const today = todayBd();
  const [produce, setProduce] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [validUntil, setValidUntil] = useState(dayAfter(30, today));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const options = useMemo(
    () =>
      (catalog.data?.data.produceTypes ?? [])
        .filter((p) => p.active)
        .map((p) => ({ value: p.code, label: bengali ? p.nameBn : p.name })),
    [catalog.data, bengali],
  );
  const type = catalog.data?.data.produceTypes.find((p) => p.code === produce);
  const unitEntry = catalog.data?.data.units.find(
    (u) => u.code === type?.unitCode,
  );
  const unit = unitEntry ? unitWord(unitEntry.symbol, unitEntry.symbolBn) : '';
  const qty = wholeNumber(quantity);
  const maxPrice = typedTaka(price);
  const missing = {
    produce: !produce,
    quantity: !validQuantity(qty),
    price: !maxPrice || maxPrice === '0',
    validUntil: !validUntil || validUntil < today,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await post({
        postRequestDto: {
          produceCode: produce!,
          quantity: qty!,
          maxUnitPrice: maxPrice!,
          validUntil,
        },
      }).unwrap();
      toast.success(t('market.requestPosted'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('market.postRequest')}</DialogTitle>
          <DialogDescription>{t('market.postRequestText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('produce') || undefined}>
            <FieldLabel htmlFor="request-produce">
              {t('market.produce')}
            </FieldLabel>
            <SearchSelect
              id="request-produce"
              options={options}
              value={produce}
              onValueChange={setProduce}
              placeholder={t('market.chooseProduce')}
              emptyText={t('market.noProduce')}
              invalid={show('produce')}
            />
            {show('produce') && (
              <FieldError>{t('market.required.produce')}</FieldError>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('quantity') || undefined}>
              <FieldLabel htmlFor="request-quantity">
                {t('market.quantity')}
                {unit && ` (${unit})`}
              </FieldLabel>
              <Input
                id="request-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={show('quantity') || undefined}
              />
              {show('quantity') && (
                <FieldError>{t('market.required.quantity')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('price') || undefined}>
              <FieldLabel htmlFor="request-price">
                {t('market.maxPrice')}
              </FieldLabel>
              <Input
                id="request-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={show('price') || undefined}
              />
              {show('price') && (
                <FieldError>{t('market.required.price')}</FieldError>
              )}
            </Field>
          </div>
          <Field data-invalid={show('validUntil') || undefined}>
            <FieldLabel htmlFor="request-until">
              {t('market.validUntil')}
            </FieldLabel>
            <Input
              id="request-until"
              type="date"
              min={today}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              aria-invalid={show('validUntil') || undefined}
            />
            {show('validUntil') ? (
              <FieldError>{t('market.required.validUntil')}</FieldError>
            ) : (
              <FieldDescription>{t('market.validUntilHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={posting.isLoading}>
              {posting.isLoading
                ? t('people.actions.working')
                : t('market.postRequest')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
