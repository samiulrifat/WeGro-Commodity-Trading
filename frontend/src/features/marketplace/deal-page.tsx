import { Link } from '@tanstack/react-router';
import { ArrowLeft, Camera, ImageOff } from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile, usePhotoUploadMutation } from '@/api/files';
import {
  type DeliveryViewDto,
  type OfferDto,
  useTradeApproveMutation,
  useTradeCancelDealMutation,
  useTradeConfirmDeliveryMutation,
  useTradeConfirmPaymentMutation,
  useTradeOfferQuery,
  useTradeRejectMutation,
  useTradeSellerPayoutMutation,
  useTradeWithdrawMutation,
} from '@/api/generated/marketplace';
import { FormError } from '@/app/auth/form-error';
import { actsAs, type Role } from '@/app/navigation';
import { ErrorState, LoadingState } from '@/components/states';
import { StepIcon } from '@/components/step-icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useObjectUrl } from '@/features/farm-updates/hooks';
import { shrinkPhoto } from '@/features/farm-updates/photo';
import { receiptNumber } from '@/features/warehouse/receipt-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  DEAL_STEPS,
  FRESH,
  produceName,
  validQuantity,
  wholeNumber,
} from './market-utils';
import { OfferStatus } from './status';
import { HistoryButton } from '@/features/audit/history-button';
import { useUnit } from '@/i18n/use-unit';

type Move =
  | 'withdraw'
  | 'approve'
  | 'reject'
  | 'cancelDeal'
  | 'payment'
  | 'deliver'
  | 'payout';
type Simple = 'withdraw' | 'approve' | 'reject' | 'cancelDeal';

/** Who hands the goods over: the site's operator, the farmer's officer or the outside seller. */
const HANDLERS: ReadonlySet<Role> = new Set<Role>([
  'warehouse',
  'field_officer',
  'seller',
]);

/**
 * One offer and, once approved, the deal: what it costs each side, where
 * the money and goods stand, both delivery confirmations, and each role's
 * moves.
 */
export function DealPage({ id }: { id: number }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const query = useTradeOfferQuery({ id }, FRESH);
  const back = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to={role === 'buyer' ? '/offers' : '/marketplace/deals'}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {role === 'buyer' ? t('nav.offers') : t('nav.sub.deals')}
      </Link>
      <HistoryButton type="offer" id={String(id)} />
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
  const o = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header offer={o} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Money offer={o} />
          <Deliveries offer={o} />
        </div>
        {/* On phones the moves come first, before the details. */}
        <div className="grid gap-6 max-lg:order-first">
          <Moves offer={o} />
          <Progress offer={o} />
        </div>
      </div>
    </div>
  );
}

function Header({ offer: o }: { offer: OfferDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <OfferStatus offer={o} />
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {produceName(o.produce, i18n.resolvedLanguage === 'bn')} ·{' '}
          {t('warehouse.quantityOf', {
            quantity: fmt.number(o.quantity),
            unit: o.produce.unit,
          })}
        </h1>
        <p className="text-white/85">
          {t('market.offerNumber', { id: o.id })} ·{' '}
          <Link
            to="/marketplace/listings/$listingId"
            params={{ listingId: String(o.listingId) }}
            className="font-semibold text-white hover:underline"
          >
            {t('market.listingNumber', { id: o.listingId })}
          </Link>
        </p>
      </div>
      <p className="text-white/85">
        {t('market.buyerLabel')}:{' '}
        <span className="font-semibold text-white">{o.buyer.name}</span>
        {' · '}
        {t('market.sellerLabel')}:{' '}
        <span className="font-semibold text-white">
          {o.seller.kind === 'wegro' ? t('market.wegro') : o.seller.name}
        </span>
      </p>
      {o.status === 'approved' && o.paymentDueAt && (
        <p
          className={cn(
            'w-fit rounded-lg px-3 py-1.5 text-sm font-semibold text-white',
            o.overdue ? 'bg-danger' : 'bg-warning',
          )}
        >
          {o.overdue
            ? t('market.overdueText')
            : t('market.payBy', { date: fmt.dateTime(o.paymentDueAt) })}
        </p>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{children}</dd>
    </div>
  );
}

function Money({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.money')}</CardTitle>
        {o.buyerFee == null && (
          <CardDescription>{t('market.feeOnApproval')}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('market.unitPrice')}>
            {t('market.perUnit', {
              price: fmt.taka(o.unitPrice),
              unit: o.produce.unit,
            })}
          </Row>
          <Row label={t('market.amount')}>{fmt.taka(o.amount)}</Row>
          {o.buyerFee != null && (
            <Row label={t('market.buyerFee')}>{fmt.taka(o.buyerFee)}</Row>
          )}
          {o.buyerPays != null && (
            <Row label={t('market.buyerPays')}>
              <span className="font-bold">{fmt.taka(o.buyerPays)}</span>
            </Row>
          )}
          {o.external && o.sellerFee != null && (
            <Row label={t('market.sellerFee')}>{fmt.taka(o.sellerFee)}</Row>
          )}
          {o.external && o.sellerReceives != null && (
            <Row label={t('market.sellerReceives')}>
              <span className="font-bold">{fmt.taka(o.sellerReceives)}</span>
            </Row>
          )}
          <Row label={t('market.madeAt')}>{fmt.dateTime(o.madeAt)}</Row>
          {o.paidAt && (
            <Row label={t('market.paidAt')}>{fmt.dateTime(o.paidAt)}</Row>
          )}
          {o.paymentReference && (
            <Row label={t('market.paymentReference')}>{o.paymentReference}</Row>
          )}
          {o.receiptPartId && (
            <Row label={t('market.buyerReceipt')}>
              <Link
                to="/warehouse/receipts/$receiptId"
                params={{ receiptId: o.receiptPartId }}
                className="hover:underline"
              >
                {receiptNumber(o.receiptPartId)}
              </Link>
            </Row>
          )}
          {o.deliveredAt && (
            <Row label={t('market.deliveredAt')}>
              {fmt.dateTime(o.deliveredAt)}
            </Row>
          )}
          {o.sellerPaidAt && (
            <Row label={t('market.sellerPaidAt')}>
              {fmt.dateTime(o.sellerPaidAt)}
            </Row>
          )}
          {o.sellerPayoutReference && (
            <Row label={t('market.payoutReference')}>
              {o.sellerPayoutReference}
            </Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

/** The steps a deal goes through; an outside seller's ends with their payout. */
function Progress({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  const steps = o.external ? DEAL_STEPS : DEAL_STEPS.slice(0, -1);
  const reached = steps.indexOf(o.status);
  const ended = reached < 0; // withdrawn, rejected, cancelled or expired
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.progress')}</CardTitle>
        {ended && (
          <CardDescription>
            {t(`market.endedText.${o.status as 'withdrawn'}`)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {steps.map((s, i) => {
            const state =
              !ended && i <= reached
                ? 'done'
                : !ended && i === reached + 1
                  ? 'waiting'
                  : null;
            return (
              <li key={s} className="flex items-center gap-3">
                {state ? (
                  <StepIcon state={state} label={t(`market.step.${s}`)} />
                ) : (
                  <span
                    aria-hidden
                    className="ml-0.5 size-4 rounded-full border-2"
                  />
                )}
                <span
                  className={cn(
                    'text-sm',
                    state === 'done'
                      ? 'font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(`market.step.${s}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function Deliveries({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  if (!o.buyerDelivery && !o.handlerDelivery) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.deliveries')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {o.discrepancy && (
          <Alert variant="destructive">
            <AlertDescription>{t('market.mismatchText')}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <DeliverySide
            title={t('market.side.buyer')}
            delivery={o.buyerDelivery}
            offer={o}
          />
          <DeliverySide
            title={t('market.side.handler')}
            delivery={o.handlerDelivery}
            offer={o}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DeliverySide({
  title,
  delivery: d,
  offer: o,
}: {
  title: string;
  delivery: DeliveryViewDto | null | undefined;
  offer: OfferDto;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const photo = useApiFile(d?.photoUrl);
  return (
    <section className="grid content-start gap-2 rounded-xl border p-3">
      <h3 className="font-semibold">{title}</h3>
      {d ? (
        <>
          <p
            className={cn(
              'text-sm',
              d.quantity !== o.quantity && 'font-semibold text-danger',
            )}
          >
            {t('warehouse.quantityOf', {
              quantity: fmt.number(d.quantity),
              unit: o.produce.unit,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {d.status === 'recorded' && d.recordedAt
              ? t('market.confirmedAt', { date: fmt.dateTime(d.recordedAt) })
              : t('market.confirming')}
          </p>
          {d.notes && (
            <p translate="no" className="text-sm whitespace-pre-line">
              {d.notes}
            </p>
          )}
          {d.photoUrl &&
            (photo.url ? (
              <img
                src={photo.url}
                alt={t('market.deliveryPhotoAlt', { side: title })}
                className="max-h-56 w-full rounded-lg bg-muted object-contain"
              />
            ) : (
              <div
                className={cn(
                  'grid h-32 place-items-center rounded-lg bg-muted text-muted-foreground',
                  !photo.error && 'animate-pulse',
                )}
              >
                {photo.error && <ImageOff aria-hidden className="size-5" />}
              </div>
            ))}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('market.notConfirmed')}
        </p>
      )}
    </section>
  );
}

/** Each role's moves at this status; the ledger checks them again. */
function Moves({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const [open, setOpen] = useState<Move | null>(null);
  // Offers on WeGro's listings are WeGro's to decide; an outside seller decides their own.
  const decider = o.external ? role === 'seller' : actsAs(role, 'admin');
  const moves: Move[] = [];
  if (o.status === 'pending') {
    if (role === 'buyer') moves.push('withdraw');
    if (decider) moves.push('approve', 'reject');
  }
  if (o.status === 'approved') {
    if (actsAs(role, 'accounts') && !o.overdue) moves.push('payment');
    if (actsAs(role, 'admin')) moves.push('cancelDeal');
  }
  if (o.status === 'paid') {
    if (role === 'buyer' && !o.buyerDelivery) moves.push('deliver');
    if (HANDLERS.has(role) && !o.handlerDelivery) moves.push('deliver');
  }
  if (o.status === 'delivered' && o.external && actsAs(role, 'accounts'))
    moves.push('payout');
  if (moves.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.manage')}</CardTitle>
        <CardDescription>
          {t(`market.dealManageText.${o.status as 'pending'}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {moves.map((m) => (
          <Button
            key={m}
            variant={
              m === 'withdraw' || m === 'reject' || m === 'cancelDeal'
                ? 'outline'
                : 'default'
            }
            onClick={() => setOpen(m)}
          >
            {t(`market.dealMove.${m}`)}
          </Button>
        ))}
      </CardContent>
      {open === 'deliver' && (
        <DeliveryDialog
          offer={o}
          side={role === 'buyer' ? 'buyer' : 'handler'}
          onClose={() => setOpen(null)}
        />
      )}
      {(open === 'payment' || open === 'payout') && (
        <ReferenceDialog offer={o} move={open} onClose={() => setOpen(null)} />
      )}
      {open &&
        open !== 'deliver' &&
        open !== 'payment' &&
        open !== 'payout' && (
          <ConfirmDialog offer={o} move={open} onClose={() => setOpen(null)} />
        )}
    </Card>
  );
}

function ConfirmDialog({
  offer: o,
  move,
  onClose,
}: {
  offer: OfferDto;
  move: Simple;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [withdraw] = useTradeWithdrawMutation();
  const [approve] = useTradeApproveMutation();
  const [reject] = useTradeRejectMutation();
  const [cancelDeal] = useTradeCancelDealMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    setBusy(true);
    const arg = { id: o.id };
    try {
      if (move === 'withdraw') await withdraw(arg).unwrap();
      if (move === 'approve') await approve(arg).unwrap();
      if (move === 'reject') await reject(arg).unwrap();
      if (move === 'cancelDeal') await cancelDeal(arg).unwrap();
      toast.success(t(`market.dealMoved.${move}`));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(`market.dealMoveTitle.${move}`, { id: o.id })}
          </DialogTitle>
          <DialogDescription>
            {t(`market.dealMoveText.${move}`, {
              buyer: o.buyer.name,
              quantity: fmt.number(o.quantity),
              unit: o.produce.unit,
              amount: fmt.taka(o.amount),
            })}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant={move === 'approve' ? 'default' : 'destructive'}
            disabled={busy}
            onClick={() => void go()}
          >
            {busy ? t('people.actions.working') : t(`market.dealMove.${move}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Accounts records money that moved outside the app: the buyer's payment
 * reaching WeGro, or WeGro's payout to an outside seller. The reference is
 * kept encrypted; the ledger keeps only its hash.
 */
function ReferenceDialog({
  offer: o,
  move,
  onClose,
}: {
  offer: OfferDto;
  move: 'payment' | 'payout';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [confirmPayment, paying] = useTradeConfirmPaymentMutation();
  const [payout, paying2] = useTradeSellerPayoutMutation();
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const empty = !ref.trim();
  const busy = paying.isLoading || paying2.isLoading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (empty) return;
    setError(null);
    const arg = {
      id: o.id,
      paymentReferenceDto: { paymentReference: ref.trim() },
    };
    try {
      if (move === 'payment') await confirmPayment(arg).unwrap();
      else await payout(arg).unwrap();
      toast.success(t(`market.dealMoved.${move}`));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  const amount = move === 'payment' ? o.buyerPays : o.sellerReceives;
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(`market.dealMoveTitle.${move}`, { id: o.id })}
          </DialogTitle>
          <DialogDescription>
            {t(`market.dealMoveText.${move}`, {
              amount: fmt.taka(amount ?? o.amount),
              buyer: o.buyer.name,
              seller: o.seller.name,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="deal-reference">
              {t('market.reference')}
            </FieldLabel>
            <Input
              id="deal-reference"
              maxLength={128}
              autoComplete="off"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              aria-invalid={(tried && empty) || undefined}
            />
            {tried && empty ? (
              <FieldError>{t('market.required.reference')}</FieldError>
            ) : (
              <FieldDescription>{t('market.referenceHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? t('people.actions.working')
                : t(`market.dealMove.${move}`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The buyer says what arrived, the one handing over what left; a photo
 * shows the goods' condition. Counts that differ from the deal are flagged.
 */
function DeliveryDialog({
  offer: o,
  side,
  onClose,
}: {
  offer: OfferDto;
  side: 'buyer' | 'handler';
  onClose: () => void;
}) {
  const unitWord = useUnit();
  const { t } = useTranslation();
  const [confirm, confirming] = useTradeConfirmDeliveryMutation();
  const [upload, uploading] = usePhotoUploadMutation();
  const [quantity, setQuantity] = useState(String(o.quantity));
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const preview = useObjectUrl(photo);
  const qty = wholeNumber(quantity);
  const bad = !validQuantity(qty);
  const busy = confirming.isLoading || uploading.isLoading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (bad) return;
    setError(null);
    try {
      const photoId = photo
        ? (await upload({ body: { file: photo } }).unwrap()).data.id
        : undefined;
      await confirm({
        id: o.id,
        confirmDeliveryDto: {
          quantity: qty!,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(photoId ? { photoId } : {}),
        },
      }).unwrap();
      toast.success(t('market.dealMoved.deliver'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('market.dealMoveTitle.deliver', { id: o.id })}
          </DialogTitle>
          <DialogDescription>
            {t(`market.deliverText.${side}`)}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && bad) || undefined}>
            <FieldLabel htmlFor="delivery-quantity">
              {t(`market.deliveredQuantity.${side}`)} (
              {unitWord(o.produce.unit, o.produce.unitBn)})
            </FieldLabel>
            <Input
              id="delivery-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={(tried && bad) || undefined}
            />
            {tried && bad ? (
              <FieldError>{t('market.required.quantity')}</FieldError>
            ) : (
              qty !== null &&
              !bad &&
              qty !== o.quantity && (
                <FieldDescription className="text-danger">
                  {t('market.differsFromDeal')}
                </FieldDescription>
              )
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="delivery-notes">
              {t('market.condition')}
            </FieldLabel>
            <Textarea
              id="delivery-notes"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="grid gap-2">
            {preview && (
              <img
                src={preview}
                alt={t('market.deliveryPhotoAlt', {
                  side: t(`market.side.${side}`),
                })}
                className="max-h-56 w-full rounded-lg bg-muted object-contain"
              />
            )}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void shrinkPhoto(file).then(setPhoto);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => camera.current?.click()}
            >
              <Camera />{' '}
              {photo ? t('farmUpdates.retake') : t('market.addPhoto')}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('market.deliveryPhotoHint')}
            </p>
          </div>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? t('people.actions.working')
                : t('market.dealMove.deliver')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
