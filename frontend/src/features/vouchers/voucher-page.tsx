import { skipToken } from '@reduxjs/toolkit/query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Printer, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type VoucherDetailDto,
  useBatchesListQuery,
  useVouchersApproveMutation,
  useVouchersCancelMutation,
  useVouchersDiscardMutation,
  useVouchersFindOneQuery,
  useVouchersRecordSaleMutation,
  useVouchersRejectMutation,
  useVouchersSetInactivityLimitMutation,
} from '@/api/generated/vouchers';
import { FormError } from '@/app/auth/form-error';
import { PrintSheet } from '@/components/print-sheet';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/use-format';
import { latinDigits } from '@/lib/format';
import { useAppSelector } from '@/store/hooks';
import { actsAs, type Role } from '@/app/navigation';
import { SaleItem } from './sales-list';
import { VoucherStatus } from './status';
import { canProposeVouchers, usedShare } from './voucher-search';
import { HistoryButton } from '@/features/audit/history-button';
import { useUnit } from '@/i18n/use-unit';

type Move = 'approve' | 'reject' | 'cancel' | 'discard';
const OPEN = new Set(['proposed', 'active']);
const MAX_LIMIT_DAYS = 3650;

/**
 * One voucher: what the farmer may take and from whom, how much is used,
 * the QR the farmer shows, its sales, and each role's moves on it.
 */
export function VoucherPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const query = useVouchersFindOneQuery({ id });
  const back = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to="/vouchers"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.vouchers')}
      </Link>
      <HistoryButton type="voucher" id={id} />
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
  const v = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header voucher={v} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Usage voucher={v} />
          <Sales voucher={v} />
        </div>
        <div className="grid gap-6">
          <Moves voucher={v} />
          <RecordSale voucher={v} />
          <VoucherQr voucher={v} />
          <Suppliers voucher={v} />
          <InactivityLimit voucher={v} />
        </div>
      </div>
    </div>
  );
}

function Header({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const staff = useAppSelector((s) => s.session.user!.role) !== 'farmer';
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <VoucherStatus voucher={v} />
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {bengali ? v.input.nameBn : v.input.name}
        </h1>
        <p className="text-white/85">
          {t('vouchers.quantityOf', {
            quantity: fmt.number(v.quantity),
            unit: v.input.unit,
          })}{' '}
          ·{' '}
          {t('vouchers.at', {
            price: fmt.taka(v.unitPrice),
            unit: v.input.unit,
          })}{' '}
          · {fmt.taka(v.value)}
        </p>
      </div>
      <p className="text-white/85">
        {staff ? (
          <>
            <Link
              to="/people/$personId"
              params={{ personId: v.farmer.id }}
              className="font-semibold text-white hover:underline"
            >
              {v.farmer.name}
            </Link>
            {' · '}
          </>
        ) : null}
        <Link
          to="/projects/$projectId"
          params={{ projectId: v.project.id }}
          className="font-semibold text-white hover:underline"
        >
          {v.project.name}
        </Link>
      </p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold">{value}</dd>
    </div>
  );
}

function Usage({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const qty = (n: number) =>
    t('vouchers.quantityOf', { quantity: fmt.number(n), unit: v.input.unit });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.usageTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-1.5">
          <Progress value={usedShare(v)} aria-label={t('vouchers.usage')} />
          <p className="text-sm text-muted-foreground">
            {t('vouchers.used', {
              spent: fmt.number(v.spentQuantity),
              quantity: fmt.number(v.quantity),
              unit: v.input.unit,
            })}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Fact
            label={t('vouchers.available')}
            value={qty(v.availableQuantity)}
          />
          <Fact
            label={t('vouchers.balance')}
            value={fmt.taka(v.availableBalance)}
          />
          <Fact label={t('vouchers.awaiting')} value={qty(v.heldQuantity)} />
          <Fact label={t('vouchers.spent')} value={qty(v.spentQuantity)} />
          {v.voidedAmount && (
            <Fact
              label={t('vouchers.voided')}
              value={fmt.taka(v.voidedAmount)}
            />
          )}
        </dl>
        <dl className="grid gap-1 text-sm">
          {v.proposedAt && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {t('vouchers.proposedAt')}
              </dt>
              <dd>{fmt.dateTime(v.proposedAt)}</dd>
            </div>
          )}
          {v.lastActivityAt && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {t('vouchers.lastActivity')}
              </dt>
              <dd>{fmt.dateTime(v.lastActivityAt)}</dd>
            </div>
          )}
          {v.inactiveSince && (
            <div className="flex justify-between gap-3 text-destructive">
              <dt>{t('vouchers.inactiveSince')}</dt>
              <dd>{fmt.dateTime(v.inactiveSince)}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Sales({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold">{t('vouchers.salesTitle')}</h2>
      {v.sales.length === 0 ? (
        <p className="text-muted-foreground">{t('vouchers.noSalesYet')}</p>
      ) : (
        <ul className="grid gap-3">
          {v.sales.map((s) => (
            <li key={s.id}>
              <SaleItem sale={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Each role's moves at this status; the ledger checks them again. */
function movesFor(role: Role, v: VoucherDetailDto): Move[] {
  const out: Move[] = [];
  if (actsAs(role, 'accounts') && v.status === 'proposed')
    out.push('approve', 'reject');
  if (actsAs(role, 'admin') && OPEN.has(v.status)) out.push('cancel');
  if (canProposeVouchers(role) && v.status === 'submitted') out.push('discard');
  return out;
}

function Moves({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const [open, setOpen] = useState<Move | null>(null);
  const moves = movesFor(role, v);
  if (moves.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.manage')}</CardTitle>
        <CardDescription>
          {t(`vouchers.manageText.${v.status}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {moves.map((m) => (
          <Button
            key={m}
            variant={
              m === 'approve'
                ? 'default'
                : m === 'reject'
                  ? 'outline'
                  : 'destructive'
            }
            onClick={() => setOpen(m)}
          >
            {m === 'discard' && <Trash2 />}
            {t(`vouchers.move.${m}`)}
          </Button>
        ))}
      </CardContent>
      {open && (
        <MoveDialog voucher={v} move={open} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

function MoveDialog({
  voucher: v,
  move,
  onClose,
}: {
  voucher: VoucherDetailDto;
  move: Move;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [approve] = useVouchersApproveMutation();
  const [reject] = useVouchersRejectMutation();
  const [cancel] = useVouchersCancelMutation();
  const [discard] = useVouchersDiscardMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    setBusy(true);
    const arg = { id: v.id };
    try {
      if (move === 'approve') await approve(arg).unwrap();
      if (move === 'reject') await reject(arg).unwrap();
      if (move === 'cancel') await cancel(arg).unwrap();
      if (move === 'discard') {
        await discard(arg).unwrap();
        void navigate({ to: '/vouchers' });
      }
      toast.success(t(`vouchers.moved.${move}`));
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
          <DialogTitle>{t(`vouchers.moveTitle.${move}`)}</DialogTitle>
          <DialogDescription>
            {t(`vouchers.moveText.${move}`, {
              value: fmt.taka(v.value),
              balance: fmt.taka(v.availableBalance),
              farmer: v.farmer.name,
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
            {busy ? t('people.actions.working') : t(`vouchers.move.${move}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The farmer shows this; a supplier's phone camera opens the voucher here. */
function VoucherQr({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const [printing, setPrinting] = useState(false);
  const usable = v.status === 'active';
  const { url, error } = useApiFile(
    usable ? `/api/vouchers/${v.id}/qr.svg` : null,
  );
  if (
    !usable ||
    (role !== 'farmer' &&
      role !== 'field_officer' &&
      role !== 'operations' &&
      role !== 'admin' &&
      role !== 'super_admin')
  ) {
    return null;
  }
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.qrTitle')}</CardTitle>
        <CardDescription>{t('vouchers.qrText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid justify-items-center gap-3">
        {url ? (
          <img
            src={url}
            alt={t('vouchers.qrAlt')}
            className="size-56 rounded-lg border bg-white p-2"
          />
        ) : error ? (
          <p className="text-sm text-destructive">{t('vouchers.qrFailed')}</p>
        ) : (
          <div className="size-56 animate-pulse rounded-lg bg-muted" />
        )}
        <Button
          variant="outline"
          className="w-full"
          disabled={!url}
          onClick={() => setPrinting(true)}
        >
          <Printer /> {t('vouchers.printQr')}
        </Button>
        {printing && url && (
          <PrintSheet onDone={() => setPrinting(false)}>
            <div className="mx-auto grid max-w-[120mm] justify-items-center gap-[4mm] pt-[20mm] text-center">
              <img src={url} alt="" className="size-[80mm]" />
              <strong className="text-[16pt]">
                {bengali ? v.input.nameBn : v.input.name}
              </strong>
              <span className="text-[12pt]">
                {v.farmer.name} ·{' '}
                {t('vouchers.quantityOf', {
                  quantity: fmt.number(v.quantity),
                  unit: v.input.unit,
                })}
              </span>
              <span className="text-[11pt]">{v.project.name}</span>
            </div>
          </PrintSheet>
        )}
      </CardContent>
    </Card>
  );
}

function Suppliers({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.suppliers')}</CardTitle>
        <CardDescription>{t('vouchers.suppliersText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {v.suppliers.map((s) => (
            <li key={s.id} className="py-2 font-medium">
              {s.name}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** A supplier records goods handed over; the farmer's officer confirms. */
function RecordSale({ voucher: v }: { voucher: VoucherDetailDto }) {
  const unitWord = useUnit();
  const { t } = useTranslation();
  const fmt = useFormat();
  const me = useAppSelector((s) => s.session.user!);
  const mine =
    me.role === 'supplier' && v.suppliers.some((s) => s.id === me.id);
  const can = mine && v.status === 'active' && v.availableQuantity > 0;
  const batches = useBatchesListQuery(
    can ? { inputTypeCode: v.input.code, limit: 50 } : skipToken,
  );
  const [record, recording] = useVouchersRecordSaleMutation();
  const [quantity, setQuantity] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  if (!can) return null;
  const qty = Number(latinDigits(quantity));
  const bad = !Number.isInteger(qty) || qty < 1 || qty > v.availableQuantity;
  const registered = (batches.data?.data ?? []).filter(
    (b) => b.status === 'registered',
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (bad) return;
    setError(null);
    try {
      await record({
        id: v.id,
        recordSaleDto: {
          quantity: qty,
          ...(chosen.length ? { batchIds: chosen } : {}),
        },
      }).unwrap();
      toast.success(t('vouchers.saleRecorded'));
      setQuantity('');
      setChosen([]);
      setTried(false);
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.recordSale')}</CardTitle>
        <CardDescription>{t('vouchers.recordSaleText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-4"
        >
          <Field data-invalid={(tried && bad) || undefined}>
            <FieldLabel htmlFor="sale-quantity">
              {t('vouchers.quantity')} ({unitWord(v.input.unit, v.input.unitBn)}
              )
            </FieldLabel>
            <Input
              id="sale-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={(tried && bad) || undefined}
            />
            {tried && bad ? (
              <FieldError>
                {t('vouchers.required.saleQuantity', {
                  max: fmt.number(v.availableQuantity),
                })}
              </FieldError>
            ) : (
              <FieldDescription>
                {t('vouchers.upTo', {
                  quantity: fmt.number(v.availableQuantity),
                  unit: v.input.unit,
                })}
              </FieldDescription>
            )}
          </Field>
          {registered.length > 0 && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-2 text-sm font-medium">
                {t('vouchers.fromBatches')}
              </legend>
              {registered.map((b) => (
                <Field
                  key={b.id}
                  orientation="horizontal"
                  className="rounded-lg border px-3 py-2"
                >
                  <Checkbox
                    id={`batch-${b.id}`}
                    checked={chosen.includes(b.id)}
                    onCheckedChange={(on) =>
                      setChosen((now) =>
                        on
                          ? [...now, b.id].slice(0, 20)
                          : now.filter((x) => x !== b.id),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`batch-${b.id}`} className="font-normal">
                    {t('vouchers.lotLabel', { lot: b.lotNumber })}
                    {b.expiresOn && (
                      <span className="text-muted-foreground">
                        {' '}
                        ·{' '}
                        {t('vouchers.expires', { date: fmt.date(b.expiresOn) })}
                      </span>
                    )}
                  </FieldLabel>
                </Field>
              ))}
            </fieldset>
          )}
          <FormError error={error} />
          <Button type="submit" disabled={recording.isLoading}>
            {recording.isLoading
              ? t('people.actions.working')
              : t('vouchers.recordSale')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** The super admin flags a voucher left unused for this many days. */
function InactivityLimit({ voucher: v }: { voucher: VoucherDetailDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const [set, setting] = useVouchersSetInactivityLimitMutation();
  const [days, setDays] = useState(
    v.inactivityLimitDays ? String(v.inactivityLimitDays) : '',
  );
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const editable = role === 'super_admin' && OPEN.has(v.status);
  if (!editable) {
    if (!v.inactivityLimitDays || role === 'farmer' || role === 'supplier')
      return null;
    return (
      <p className="text-sm text-muted-foreground">
        {t('vouchers.limitIs', { days: fmt.number(v.inactivityLimitDays) })}
      </p>
    );
  }
  const n = Number(latinDigits(days));
  const bad =
    days.trim() !== '' && (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT_DAYS);

  async function save(value: number | null) {
    setError(null);
    try {
      await set({ id: v.id, inactivityLimitDto: { days: value } }).unwrap();
      toast.success(
        value ? t('vouchers.limitSaved') : t('vouchers.limitRemoved'),
      );
      if (!value) setDays('');
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (bad) return;
    void save(days.trim() ? n : null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.limitTitle')}</CardTitle>
        <CardDescription>{t('vouchers.limitText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={submit} className="grid gap-3">
          <Field data-invalid={(tried && bad) || undefined}>
            <FieldLabel htmlFor="limit-days">
              {t('vouchers.limitDays')}
            </FieldLabel>
            <Input
              id="limit-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-invalid={(tried && bad) || undefined}
            />
            {tried && bad ? (
              <FieldError>
                {t('vouchers.required.limit', {
                  max: fmt.number(MAX_LIMIT_DAYS),
                })}
              </FieldError>
            ) : (
              <FieldDescription>{t('vouchers.limitHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={setting.isLoading}>
              {t('vouchers.saveLimit')}
            </Button>
            {v.inactivityLimitDays != null && (
              <Button
                type="button"
                variant="ghost"
                disabled={setting.isLoading}
                onClick={() => void save(null)}
              >
                {t('vouchers.removeLimit')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
