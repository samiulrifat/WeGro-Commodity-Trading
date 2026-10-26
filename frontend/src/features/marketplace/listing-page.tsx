import { Link } from '@tanstack/react-router';
import { ArrowLeft, ImageOff } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type ListingDto,
  useTradeApproveListingMutation,
  useTradeCancelListingMutation,
  useTradeFeesQuery,
  useTradeListingQuery,
  useTradeListOffersQuery,
  useTradeMakeOfferMutation,
  useTradeRejectListingMutation,
} from '@/api/generated/marketplace';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { typedTaka } from '@/features/projects/project-math';
import { receiptNumber } from '@/features/warehouse/receipt-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { OfferRow } from './deals-list';
import {
  addTaka,
  dealAmount,
  feeFor,
  FRESH,
  knownDistrict,
  produceName,
  sellerName,
  validQuantity,
  wholeNumber,
} from './market-utils';
import { ListingStatus } from './status';
import { HistoryButton } from '@/features/audit/history-button';

type Move = 'offer' | 'approve' | 'reject' | 'cancel';

/**
 * One listing: what is for sale and from whom, the seller's photos, the
 * offers made on it, and each role's moves (offer, approve or turn down an
 * outside seller's listing, take it down).
 */
export function ListingPage({ id }: { id: number }) {
  const { t } = useTranslation();
  // Sellers come here from their own listings.
  const seller = useAppSelector((s) => s.session.user!.role) === 'seller';
  const query = useTradeListingQuery({ id }, FRESH);
  const back = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to={seller ? '/marketplace/mine' : '/marketplace'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {seller ? t('nav.sub.myListings') : t('nav.sub.listings')}
      </Link>
      <HistoryButton type="listing" id={String(id)} />
    </div>
  );
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  const l = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header listing={l} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Photos listing={l} />
          <Details listing={l} />
          <Offers listing={l} />
        </div>
        {/* On phones the moves come first, before the details. */}
        <div className="grid gap-6 max-lg:order-first">
          <Moves listing={l} />
        </div>
      </div>
    </div>
  );
}

function Header({ listing: l }: { listing: ListingDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <ListingStatus listing={l} />
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {produceName(l.produce, i18n.resolvedLanguage === 'bn')} ·{' '}
          {t('market.perUnit', {
            price: fmt.taka(l.askingUnitPrice),
            unit: l.produce.unit,
          })}
        </h1>
        <p className="text-white/85">
          {t('market.listingNumber', { id: l.id })} ·{' '}
          {knownDistrict(l.district.code)
            ? t(`districts.${l.district.code}`)
            : l.district.name}
        </p>
      </div>
      <p className="text-white/85">
        <span className="font-semibold text-white">
          {sellerName(l, t('market.wegro'))}
        </span>
        {l.project && (
          <>
            {' · '}
            <Link
              to="/projects/$projectId"
              params={{ projectId: l.project.id }}
              className="font-semibold text-white hover:underline"
            >
              {l.project.name}
            </Link>
          </>
        )}
      </p>
      <p className="text-lg font-semibold">
        {t('market.availableOf', {
          available: fmt.number(l.available),
          quantity: fmt.number(l.quantity),
          unit: l.produce.unit,
        })}
      </p>
    </section>
  );
}

function Photos({ listing: l }: { listing: ListingDto }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(0);
  if (l.photos.length === 0 && !l.description) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.fromSeller')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {l.photos.length > 0 && (
          <>
            <ListingPhoto
              path={l.photos[at]!}
              alt={t('market.photoAlt', { n: at + 1 })}
              className="aspect-[4/3] w-full"
            />
            {l.photos.length > 1 && (
              <div className="flex gap-2">
                {l.photos.map((p, i) => (
                  <button
                    key={p}
                    type="button"
                    aria-label={t('market.photoAlt', { n: i + 1 })}
                    aria-pressed={at === i}
                    onClick={() => setAt(i)}
                    className={cn(
                      'rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      at === i && 'ring-2 ring-ink',
                    )}
                  >
                    <ListingPhoto path={p} alt="" className="size-16" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {l.description && (
          <p className="whitespace-pre-line">{l.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ListingPhoto({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const { url, error } = useApiFile(path);
  return url ? (
    <img
      src={url}
      alt={alt}
      className={cn('rounded-xl bg-muted object-contain', className)}
    />
  ) : (
    <div
      className={cn(
        'grid place-items-center rounded-xl bg-muted text-muted-foreground',
        !error && 'animate-pulse',
        className,
      )}
    >
      {error && <ImageOff aria-hidden className="size-6" />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Details({ listing: l }: { listing: ListingDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const q = (n: number) =>
    t('warehouse.quantityOf', {
      quantity: fmt.number(n),
      unit: l.produce.unit,
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('market.listedQuantity')}>{q(l.quantity)}</Row>
          <Row label={t('market.available')}>{q(l.available)}</Row>
          <Row label={t('market.askingPrice')}>
            {t('market.perUnit', {
              price: fmt.taka(l.askingUnitPrice),
              unit: l.produce.unit,
            })}
          </Row>
          <Row label={t('market.sourceLabel')}>
            {t(`market.source.${l.source}`)}
          </Row>
          {l.receiptId && (
            <Row label={t('market.receipt')}>
              <Link
                to="/warehouse/receipts/$receiptId"
                params={{ receiptId: l.receiptId }}
                className="hover:underline"
              >
                {receiptNumber(l.receiptId)}
              </Link>
            </Row>
          )}
          {l.unpaidDeals > 0 && (
            <Row label={t('market.unpaidDeals')}>
              {fmt.number(l.unpaidDeals)}
            </Row>
          )}
          <Row label={t('market.listedAt')}>{fmt.dateTime(l.createdAt)}</Row>
          {l.decidedAt && (
            <Row label={t('market.decidedAt')}>{fmt.dateTime(l.decidedAt)}</Row>
          )}
          {l.closedAt && (
            <Row label={t('market.closedAt')}>{fmt.dateTime(l.closedAt)}</Row>
          )}
        </dl>
        {l.rejectReason && (
          <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            <span className="font-semibold">{t('market.rejectReason')}: </span>
            {l.rejectReason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** The offers made on this listing (a buyer sees only their own). */
function Offers({ listing: l }: { listing: ListingDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const query = useTradeListOffersQuery({ listingId: l.id, limit: 50 }, FRESH);
  const offers = query.data?.data ?? [];
  if (l.status === 'pending' || l.status === 'rejected') return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {role === 'buyer' ? t('market.yourOffers') : t('market.offers')}
        </CardTitle>
        {query.data && (
          <CardDescription>
            {offers.length === 0
              ? t('market.noOffersYet')
              : t('market.offersCount', { count: query.data.meta.total })}
          </CardDescription>
        )}
      </CardHeader>
      {offers.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {offers.map((o) => (
              <li key={o.id}>
                <OfferRow offer={o} />
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

/** Each role's moves at this status; the ledger checks them again. */
function Moves({ listing: l }: { listing: ListingDto }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  const [open, setOpen] = useState<Move | null>(null);
  const role = user.role;
  const live = l.status === 'open' || l.status === 'pending';
  const ownSeller = role === 'seller' && l.seller.id === user.id;
  const moves: Move[] = [];
  if (role === 'buyer' && l.status === 'open' && l.available > 0)
    moves.push('offer');
  if (actsAs(role, 'admin') && l.status === 'pending')
    moves.push('approve', 'reject');
  if (
    live &&
    (actsAs(role, 'admin') ||
      ownSeller ||
      (role === 'field_officer' && l.seller.kind === 'farmer'))
  )
    moves.push('cancel');
  if (moves.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.manage')}</CardTitle>
        <CardDescription>
          {t(`market.manageText.${moveText(l, role, ownSeller)}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {moves.map((m) => (
          <Button
            key={m}
            variant={m === 'cancel' || m === 'reject' ? 'outline' : 'default'}
            disabled={m === 'cancel' && l.unpaidDeals > 0}
            onClick={() => setOpen(m)}
          >
            {t(`market.move.${m}`)}
          </Button>
        ))}
        {moves.includes('cancel') && l.unpaidDeals > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('market.cancelBlocked', { count: l.unpaidDeals })}
          </p>
        )}
      </CardContent>
      {open === 'offer' && (
        <OfferDialog listing={l} onClose={() => setOpen(null)} />
      )}
      {open === 'reject' && (
        <RejectDialog listing={l} onClose={() => setOpen(null)} />
      )}
      {(open === 'approve' || open === 'cancel') && (
        <ConfirmDialog listing={l} move={open} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

const moveText = (l: ListingDto, role: string, ownSeller: boolean) =>
  role === 'buyer'
    ? 'buyer'
    : l.status === 'pending'
      ? ownSeller
        ? 'pendingSeller'
        : 'pending'
      : 'open';

function ConfirmDialog({
  listing: l,
  move,
  onClose,
}: {
  listing: ListingDto;
  move: 'approve' | 'cancel';
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const [approve, approving] = useTradeApproveListingMutation();
  const [cancel, cancelling] = useTradeCancelListingMutation();
  const [error, setError] = useState<ApiError | null>(null);
  const busy = approving.isLoading || cancelling.isLoading;

  async function go() {
    setError(null);
    try {
      if (move === 'approve') await approve({ id: l.id }).unwrap();
      else await cancel({ id: l.id }).unwrap();
      toast.success(t(`market.moved.${move}`));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(`market.moveTitle.${move}`, { id: l.id })}
          </DialogTitle>
          <DialogDescription>
            {t(`market.moveText.${move}`, {
              produce: produceName(l.produce, i18n.resolvedLanguage === 'bn'),
              quantity: fmt.number(l.available),
              unit: l.produce.unit,
              seller: sellerName(l, t('market.wegro')),
            })}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant={move === 'cancel' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => void go()}
          >
            {busy ? t('people.actions.working') : t(`market.move.${move}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An admin turns down an outside seller's listing, saying why. */
function RejectDialog({
  listing: l,
  onClose,
}: {
  listing: ListingDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reject, rejecting] = useTradeRejectListingMutation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const short = reason.trim().length < 5;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (short) return;
    setError(null);
    try {
      await reject({
        id: l.id,
        rejectListingDto: { reason: reason.trim() },
      }).unwrap();
      toast.success(t('market.moved.reject'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('market.moveTitle.reject', { id: l.id })}
          </DialogTitle>
          <DialogDescription>{t('market.moveText.reject')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && short) || undefined}>
            <FieldLabel htmlFor="reject-reason">
              {t('market.rejectReason')}
            </FieldLabel>
            <Textarea
              id="reject-reason"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={(tried && short) || undefined}
            />
            {tried && short ? (
              <FieldError>{t('market.required.reason')}</FieldError>
            ) : (
              <FieldDescription>{t('market.reasonHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={rejecting.isLoading}
            >
              {rejecting.isLoading
                ? t('people.actions.working')
                : t('market.move.reject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A buyer offers a quantity at their own price. The platform fee is shown
 * from the current slabs; it is fixed when the offer is approved.
 */
function OfferDialog({
  listing: l,
  onClose,
}: {
  listing: ListingDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const fees = useTradeFeesQuery();
  const [offer, offering] = useTradeMakeOfferMutation();
  const [quantity, setQuantity] = useState(String(l.available));
  const [price, setPrice] = useState(l.askingUnitPrice.replace(/\.00$/, ''));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const qty = wholeNumber(quantity);
  const unitPrice = typedTaka(price);
  const missing = {
    quantity: !validQuantity(qty, l.available),
    price: !unitPrice || unitPrice === '0',
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const amount =
    !missing.quantity && !missing.price ? dealAmount(qty!, unitPrice!) : null;
  const fee = amount && fees.data ? feeFor(amount, fees.data.data.slabs) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await offer({
        id: l.id,
        makeOfferDto: { quantity: qty!, unitPrice: unitPrice! },
      }).unwrap();
      toast.success(t('market.offered'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('market.move.offer')}</DialogTitle>
          <DialogDescription>
            {t('market.offerText', {
              available: fmt.number(l.available),
              unit: l.produce.unit,
              price: fmt.taka(l.askingUnitPrice),
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('quantity') || undefined}>
              <FieldLabel htmlFor="offer-quantity">
                {t('market.quantity')} ({l.produce.unit})
              </FieldLabel>
              <Input
                id="offer-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={show('quantity') || undefined}
              />
              {show('quantity') && (
                <FieldError>
                  {t('market.required.offerQuantity', {
                    available: fmt.number(l.available),
                  })}
                </FieldError>
              )}
            </Field>
            <Field data-invalid={show('price') || undefined}>
              <FieldLabel htmlFor="offer-price">
                {t('market.yourPrice')}
              </FieldLabel>
              <Input
                id="offer-price"
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
          <dl className="grid gap-1 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t('market.amount')}</dt>
              <dd className="font-medium">{amount ? fmt.taka(amount) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('market.buyerFee')}</dt>
              <dd className="font-medium">{fee ? fmt.taka(fee) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
              <dt>{t('market.youPay')}</dt>
              <dd>{amount && fee ? fmt.taka(addTaka(amount, fee)) : '—'}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {t('market.feeFixedOnApproval')}
          </p>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={offering.isLoading}>
              {offering.isLoading
                ? t('people.actions.working')
                : t('market.sendOffer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
