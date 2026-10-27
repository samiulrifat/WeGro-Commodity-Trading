import { Link } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Printer } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type ReceiptDetailDto,
  useWarehouseAcceptHandoverMutation,
  useWarehouseCancelHandoverMutation,
  useWarehouseCollectMutation,
  useWarehouseExtendMutation,
  useWarehouseFindOneQuery,
  useWarehouseListSitesQuery,
  useWarehouseOfferHandoverMutation,
} from '@/api/generated/warehouse';
import { FormError } from '@/app/auth/form-error';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useFormat } from '@/i18n/use-format';
import { todayBd } from '@/lib/format';
import { useAppSelector } from '@/store/hooks';
import { actsAs } from '@/app/navigation';
import { ReceiptPrint } from './receipt-print';
import {
  dayAfter,
  daysLeft,
  expiringSoon,
  moisture,
  receiptNumber,
  wholeNumber,
} from './receipt-utils';
import { ReceiptStatus } from './status';
import { HistoryButton } from '@/features/audit/history-button';

type Move = 'collect' | 'offer' | 'withdraw' | 'accept' | 'decline';
const RECHECKABLE = new Set(['issued', 'pending_handover', 'listed', 'sold']);

/**
 * One warehouse receipt: what is stored and where, its intake and
 * re-checks, the QR anyone can check, a printable copy, and each role's
 * moves on it.
 */
export function ReceiptPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const query = useWarehouseFindOneQuery({ id });
  const back = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to="/warehouse"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.sub.allReceipts')}
      </Link>
      <HistoryButton type="receipt" id={id} />
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
  const r = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header receipt={r} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Details receipt={r} />
          <Rechecks receipt={r} />
        </div>
        <div className="grid gap-6">
          <Moves receipt={r} />
          <ReceiptQr receipt={r} />
        </div>
      </div>
    </div>
  );
}

function Header({ receipt: r }: { receipt: ReceiptDetailDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const produce =
    i18n.resolvedLanguage === 'bn' && r.produce.nameBn
      ? r.produce.nameBn
      : r.produce.name;
  const left = daysLeft(r.expiresOn);
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <ReceiptStatus receipt={r} />
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {produce} ·{' '}
          {t('warehouse.quantityOf', {
            quantity: fmt.number(r.quantity),
            unit: r.produce.unit,
          })}
        </h1>
        <p className="text-white/85">
          {receiptNumber(r.id)} · {r.site.name}
        </p>
      </div>
      <p className="text-white/85">
        <span className="font-semibold text-white">{r.owner.name}</span>
        {' · '}
        <Link
          to="/projects/$projectId"
          params={{ projectId: r.project.id }}
          className="font-semibold text-white hover:underline"
        >
          {r.project.name}
        </Link>
      </p>
      {expiringSoon(r) && (
        <p className="w-fit rounded-lg bg-warning px-3 py-1.5 text-sm font-semibold text-white">
          {t('warehouse.daysLeft', { count: left })}
        </p>
      )}
    </section>
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

function Details({ receipt: r }: { receipt: ReceiptDetailDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const q = (n: number) =>
    t('warehouse.quantityOf', {
      quantity: fmt.number(n),
      unit: r.produce.unit,
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('warehouse.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('warehouse.held')}>{q(r.quantity)}</Row>
          {r.originalQuantity !== r.quantity && (
            <Row label={t('warehouse.original')}>{q(r.originalQuantity)}</Row>
          )}
          {r.intake.bagCount != null && (
            <Row label={t('warehouse.bags')}>
              {fmt.number(r.intake.bagCount)}
            </Row>
          )}
          {r.intake.moisturePercent && (
            <Row label={t('warehouse.moisture')}>
              {fmt.number(r.intake.moisturePercent, 1)}%
            </Row>
          )}
          {r.intake.storageBay && (
            <Row label={t('warehouse.bay')}>{r.intake.storageBay}</Row>
          )}
          <Row label={t('warehouse.intakeDate')}>
            {fmt.date(r.intake.intakeDate)}
          </Row>
          <Row label={t('warehouse.expiresOn')}>{fmt.date(r.expiresOn)}</Row>
          {r.issuedAt && (
            <Row label={t('warehouse.issuedAt')}>
              {fmt.dateTime(r.issuedAt)}
            </Row>
          )}
          {r.collectedAt && (
            <Row label={t('warehouse.collectedAt')}>
              {fmt.dateTime(r.collectedAt)}
            </Row>
          )}
          {r.parentId && (
            <Row label={t('warehouse.splitFrom')}>
              <Link
                to="/warehouse/receipts/$receiptId"
                params={{ receiptId: r.parentId }}
                className="hover:underline"
              >
                {receiptNumber(r.parentId)}
              </Link>
            </Row>
          )}
          {r.children.length > 0 && (
            <Row label={t('warehouse.splitTo')}>
              {r.children.map((c, i) => (
                <span key={c}>
                  {i > 0 && ', '}
                  <Link
                    to="/warehouse/receipts/$receiptId"
                    params={{ receiptId: c }}
                    className="hover:underline"
                  >
                    {receiptNumber(c)}
                  </Link>
                </span>
              ))}
            </Row>
          )}
        </dl>
        {r.intake.notes && (
          <p
            translate="no"
            className="mt-4 whitespace-pre-line text-muted-foreground"
          >
            {r.intake.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Rechecks({ receipt: r }: { receipt: ReceiptDetailDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (r.rechecks.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('warehouse.rechecks')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative grid gap-4 border-l pl-5">
          {r.rechecks.map((c, i) => (
            <li key={`${c.checkedOn}-${i}`} className="relative">
              <span
                aria-hidden
                className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-brand"
              />
              <p className="font-medium">
                {t('warehouse.recheckOn', {
                  date: fmt.date(c.checkedOn),
                  until: fmt.date(c.newExpiresOn),
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {[
                  c.bagCount != null &&
                    t('warehouse.bagsCount', { count: c.bagCount }),
                  c.moisturePercent &&
                    `${t('warehouse.moisture')}: ${fmt.number(c.moisturePercent, 1)}%`,
                  c.storageBay && `${t('warehouse.bay')}: ${c.storageBay}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {c.notes && (
                <p translate="no" className="text-sm whitespace-pre-line">
                  {c.notes}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Each role's moves at this status; the ledger checks them again. */
function Moves({ receipt: r }: { receipt: ReceiptDetailDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const mySite = useWarehouseListSitesQuery({}, { skip: role !== 'warehouse' })
    .data?.data[0];
  const [open, setOpen] = useState<Move | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const atMySite = role === 'warehouse' && mySite?.id === r.site.id;
  const moves: Move[] = [];
  if (atMySite && r.status === 'issued') moves.push('collect');
  if (
    role === 'field_officer' &&
    r.status === 'issued' &&
    r.owner.kind === 'farmer' &&
    !r.expired
  )
    moves.push('offer');
  if (role === 'field_officer' && r.status === 'pending_handover')
    moves.push('withdraw');
  if (actsAs(role, 'admin') && r.status === 'pending_handover')
    moves.push('accept', 'decline');
  const canRecheck = atMySite && RECHECKABLE.has(r.status);
  if (moves.length === 0 && !canRecheck) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('warehouse.manage')}</CardTitle>
        <CardDescription>
          {t(`warehouse.manageText.${r.status}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {canRecheck && (
          <Button onClick={() => setRechecking(true)}>
            {t('warehouse.recheck')}
          </Button>
        )}
        {moves.map((m) => (
          <Button
            key={m}
            variant={
              m === 'decline' || m === 'withdraw'
                ? 'outline'
                : m === 'collect'
                  ? 'outline'
                  : 'default'
            }
            onClick={() => setOpen(m)}
          >
            {t(`warehouse.move.${m}`)}
          </Button>
        ))}
      </CardContent>
      {open && (
        <MoveDialog receipt={r} move={open} onClose={() => setOpen(null)} />
      )}
      {rechecking && (
        <RecheckDialog receipt={r} onClose={() => setRechecking(false)} />
      )}
    </Card>
  );
}

function MoveDialog({
  receipt: r,
  move,
  onClose,
}: {
  receipt: ReceiptDetailDto;
  move: Move;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [collect] = useWarehouseCollectMutation();
  const [offer] = useWarehouseOfferHandoverMutation();
  const [accept] = useWarehouseAcceptHandoverMutation();
  const [cancel] = useWarehouseCancelHandoverMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    setBusy(true);
    const arg = { id: r.id };
    try {
      if (move === 'collect') await collect(arg).unwrap();
      if (move === 'offer') await offer(arg).unwrap();
      if (move === 'accept') await accept(arg).unwrap();
      if (move === 'withdraw' || move === 'decline') await cancel(arg).unwrap();
      toast.success(t(`warehouse.moved.${move}`));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(`warehouse.moveTitle.${move}`, { number: receiptNumber(r.id) })}
          </DialogTitle>
          <DialogDescription>
            {t(`warehouse.moveText.${move}`, {
              quantity: fmt.number(r.quantity),
              unit: r.produce.unit,
              owner: r.owner.name,
              site: r.site.name,
            })}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant={
              move === 'decline' || move === 'withdraw'
                ? 'destructive'
                : 'default'
            }
            disabled={busy}
            onClick={() => void go()}
          >
            {busy ? t('people.actions.working') : t(`warehouse.move.${move}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The issuing site checks the goods again and gives them a later last valid day. */
function RecheckDialog({
  receipt: r,
  onClose,
}: {
  receipt: ReceiptDetailDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [extend, extending] = useWarehouseExtendMutation();
  const today = todayBd();
  const later = r.expiresOn > today ? r.expiresOn : today;
  const [checkedOn, setCheckedOn] = useState(today);
  const [newExpiresOn, setNewExpiresOn] = useState(dayAfter(90, later));
  const [bags, setBags] = useState(
    r.intake.bagCount != null ? String(r.intake.bagCount) : '',
  );
  const [moist, setMoist] = useState('');
  const [bay, setBay] = useState(r.intake.storageBay ?? '');
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const bagCount = wholeNumber(bags);
  const moistureValue = moisture(moist);
  const missing = {
    checkedOn: !checkedOn || checkedOn > today,
    newExpiresOn:
      !newExpiresOn || newExpiresOn <= r.expiresOn || newExpiresOn <= today,
    bags: bagCount !== null && (Number.isNaN(bagCount) || bagCount < 1),
    moisture: moistureValue === undefined,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await extend({
        id: r.id,
        recheckDto: {
          checkedOn,
          newExpiresOn,
          ...(bagCount ? { bagCount } : {}),
          ...(moistureValue ? { moisturePercent: moistureValue } : {}),
          ...(bay.trim() ? { storageBay: bay.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }).unwrap();
      toast.success(t('warehouse.extended', { date: fmt.date(newExpiresOn) }));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('warehouse.recheck')}</DialogTitle>
          <DialogDescription>
            {t('warehouse.recheckText', { date: fmt.date(r.expiresOn) })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('checkedOn') || undefined}>
              <FieldLabel htmlFor="recheck-on">
                {t('warehouse.checkedOn')}
              </FieldLabel>
              <Input
                id="recheck-on"
                type="date"
                max={today}
                value={checkedOn}
                onChange={(e) => setCheckedOn(e.target.value)}
                aria-invalid={show('checkedOn') || undefined}
              />
              {show('checkedOn') && (
                <FieldError>{t('warehouse.required.checkedOn')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('newExpiresOn') || undefined}>
              <FieldLabel htmlFor="recheck-until">
                {t('warehouse.newExpiresOn')}
              </FieldLabel>
              <Input
                id="recheck-until"
                type="date"
                min={dayAfter(1, later)}
                value={newExpiresOn}
                onChange={(e) => setNewExpiresOn(e.target.value)}
                aria-invalid={show('newExpiresOn') || undefined}
              />
              {show('newExpiresOn') && (
                <FieldError>
                  {t('warehouse.required.newExpiresOn', {
                    date: fmt.date(r.expiresOn),
                  })}
                </FieldError>
              )}
            </Field>
            <Field data-invalid={show('bags') || undefined}>
              <FieldLabel htmlFor="recheck-bags">
                {t('warehouse.bags')}
              </FieldLabel>
              <Input
                id="recheck-bags"
                inputMode="numeric"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                aria-invalid={show('bags') || undefined}
              />
              {show('bags') ? (
                <FieldError>{t('warehouse.required.bags')}</FieldError>
              ) : (
                <FieldDescription>{t('warehouse.optional')}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={show('moisture') || undefined}>
              <FieldLabel htmlFor="recheck-moisture">
                {t('warehouse.moisture')}
              </FieldLabel>
              <Input
                id="recheck-moisture"
                inputMode="decimal"
                value={moist}
                onChange={(e) => setMoist(e.target.value)}
                aria-invalid={show('moisture') || undefined}
              />
              {show('moisture') ? (
                <FieldError>{t('warehouse.required.moisture')}</FieldError>
              ) : (
                <FieldDescription>{t('warehouse.optional')}</FieldDescription>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="recheck-bay">{t('warehouse.bay')}</FieldLabel>
            <Input
              id="recheck-bay"
              maxLength={40}
              value={bay}
              onChange={(e) => setBay(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="recheck-notes">
              {t('warehouse.notes')}
            </FieldLabel>
            <Textarea
              id="recheck-notes"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={extending.isLoading}>
              {extending.isLoading
                ? t('people.actions.working')
                : t('warehouse.saveRecheck')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptQr({ receipt: r }: { receipt: ReceiptDetailDto }) {
  const { t } = useTranslation();
  const { url, error } = useApiFile(`/api/verify/receipts/${r.id}/qr.svg`);
  const [printing, setPrinting] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('warehouse.qrTitle')}</CardTitle>
        <CardDescription>{t('warehouse.qrText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid justify-items-center gap-3">
        {url ? (
          <img
            src={url}
            alt={t('vouchers.qrAlt')}
            className="size-48 rounded-lg border bg-white p-2"
          />
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{t('vouchers.qrFailed')}</AlertDescription>
          </Alert>
        ) : (
          <div className="size-48 animate-pulse rounded-lg bg-muted" />
        )}
        <a
          href={`/verify/receipt/${r.id}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'ghost', className: 'w-full' })}
        >
          <ExternalLink /> {t('vouchers.openCheck')}
        </a>
        <Button
          className="w-full"
          disabled={!url}
          onClick={() => setPrinting(true)}
        >
          <Printer /> {t('warehouse.printReceipt')}
        </Button>
      </CardContent>
      {printing && url && (
        <ReceiptPrint receipt={r} qr={url} onDone={() => setPrinting(false)} />
      )}
    </Card>
  );
}
