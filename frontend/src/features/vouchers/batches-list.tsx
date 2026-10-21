import { Link, useNavigate } from '@tanstack/react-router';
import { Boxes, Plus } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import {
  type BatchDto,
  useBatchesListQuery,
  useBatchesRegisterMutation,
} from '@/api/generated/vouchers';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { StatusPill } from '@/components/status-pill';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/use-format';
import { latinDigits, todayBd } from '@/lib/format';
import { useAppSelector } from '@/store/hooks';
import { type BatchListSearch, isExpired } from './voucher-search';

const PAGE_SIZE = 20;
export type BatchesBase = '/batches' | '/vouchers/batches';

/**
 * Lots of inputs suppliers registered on the ledger, each with a QR that
 * proves it genuine. Suppliers see and register their own; staff and
 * officers see all, also searched by supplier.
 */
export function BatchesList({
  search,
  base,
}: {
  search: BatchListSearch;
  base: BatchesBase;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [registering, setRegistering] = useState(false);
  const page = search.page ?? 1;
  const query = useBatchesListQuery({ page, limit: PAGE_SIZE, q: search.q });
  const supplier = role === 'supplier';
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={supplier ? t('nav.batches') : t('nav.sub.inputBatches')}
        description={
          supplier
            ? t('vouchers.batchesIntro.supplier')
            : t('vouchers.batchesIntro.staff')
        }
        actions={
          supplier && (
            <Button onClick={() => setRegistering(true)}>
              <Plus /> {t('vouchers.registerBatch')}
            </Button>
          )
        }
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => void navigate({ to: base, search: { q } })}
        placeholder={
          supplier
            ? t('vouchers.searchBatchesOwn')
            : t('vouchers.searchBatches')
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
          icon={Boxes}
          title={
            search.q ? t('vouchers.noBatchMatch') : t('vouchers.noBatches')
          }
          description={
            search.q
              ? t('projects.noMatchHint')
              : supplier
                ? t('vouchers.noBatchesHint')
                : undefined
          }
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((b) => (
              <li key={b.id}>
                <BatchCard batch={b} base={base} showSupplier={!supplier} />
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({ to: base, search: { ...search, page: p } })
              }
            />
          )}
        </>
      )}
      {registering && (
        <RegisterBatchDialog
          base={base}
          onClose={() => setRegistering(false)}
        />
      )}
    </div>
  );
}

export function BatchStatus({ batch: b }: { batch: BatchDto }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusPill
        tone={b.status === 'registered' ? 'success' : 'neutral'}
        appearance="soft"
      >
        {t(`vouchers.batchStatus.${b.status}`)}
      </StatusPill>
      {isExpired(b) && (
        <StatusPill tone="danger" appearance="soft">
          {t('vouchers.expired')}
        </StatusPill>
      )}
    </span>
  );
}

function BatchCard({
  batch: b,
  base,
  showSupplier,
}: {
  batch: BatchDto;
  base: BatchesBase;
  showSupplier: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const link =
    'outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50';
  return (
    <article className="relative grid gap-2 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          {base === '/batches' ? (
            <Link
              to="/batches/$batchId"
              params={{ batchId: b.id }}
              className={link}
            >
              {t('vouchers.lotLabel', { lot: b.lotNumber })}
            </Link>
          ) : (
            <Link
              to="/vouchers/batches/$batchId"
              params={{ batchId: b.id }}
              className={link}
            >
              {t('vouchers.lotLabel', { lot: b.lotNumber })}
            </Link>
          )}
        </h3>
        <p className="text-sm text-muted-foreground">
          {bengali ? b.input.nameBn : b.input.name}
          {b.manufacturer && ` · ${b.manufacturer}`}
        </p>
      </div>
      {showSupplier && <p className="text-sm font-medium">{b.supplier.name}</p>}
      <p className="text-sm text-muted-foreground">
        {t('vouchers.producedOn', { date: fmt.date(b.producedOn) })}
        {b.expiresOn && (
          <> · {t('vouchers.expires', { date: fmt.date(b.expiresOn) })}</>
        )}
      </p>
      <BatchStatus batch={b} />
    </article>
  );
}

const MAX_QUANTITY = 1_000_000_000_000;

function RegisterBatchDialog({
  base,
  onClose,
}: {
  base: BatchesBase;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const bengali = i18n.resolvedLanguage === 'bn';
  const catalog = useCatalogGetQuery({});
  const [register, registering] = useBatchesRegisterMutation();
  const [input, setInput] = useState<string | null>(null);
  const [lot, setLot] = useState('');
  const [quantity, setQuantity] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [producedOn, setProducedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inputs = useMemo(
    () =>
      (catalog.data?.data.inputTypes ?? []).map((i) => ({
        value: i.code,
        label: bengali ? i.nameBn : i.name,
      })),
    [catalog.data, bengali],
  );
  const today = todayBd();
  const qty = Number(latinDigits(quantity));
  const missing = {
    input: !input,
    lot: !lot.trim(),
    quantity:
      quantity.trim() !== '' &&
      (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY),
    producedOn: !producedOn || producedOn > today,
    expiresOn: !!expiresOn && !!producedOn && expiresOn < producedOn,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      const res = await register({
        registerBatchDto: {
          inputTypeCode: input!,
          lotNumber: lot.trim(),
          producedOn,
          ...(quantity.trim() ? { quantity: qty } : {}),
          ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
          ...(expiresOn ? { expiresOn } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }).unwrap();
      toast.success(t('vouchers.batchRegistered'));
      onClose();
      if (base === '/batches')
        void navigate({
          to: '/batches/$batchId',
          params: { batchId: res.data.id },
        });
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('vouchers.registerBatch')}</DialogTitle>
          <DialogDescription>
            {t('vouchers.registerBatchText')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('input') || undefined}>
            <FieldLabel htmlFor="batch-input">{t('vouchers.input')}</FieldLabel>
            <SearchSelect
              id="batch-input"
              options={inputs}
              value={input}
              onValueChange={setInput}
              placeholder={t('vouchers.chooseInput')}
              emptyText={t('bank.noMatch')}
              invalid={show('input')}
            />
            {show('input') && (
              <FieldError>{t('vouchers.required.input')}</FieldError>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('lot') || undefined}>
              <FieldLabel htmlFor="batch-lot">
                {t('vouchers.lotNumber')}
              </FieldLabel>
              <Input
                id="batch-lot"
                maxLength={64}
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                aria-invalid={show('lot') || undefined}
              />
              {show('lot') ? (
                <FieldError>{t('vouchers.required.lot')}</FieldError>
              ) : (
                <FieldDescription>{t('vouchers.lotHint')}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={show('quantity') || undefined}>
              <FieldLabel htmlFor="batch-quantity">
                {t('vouchers.batchSize')}
              </FieldLabel>
              <Input
                id="batch-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={show('quantity') || undefined}
              />
              {show('quantity') ? (
                <FieldError>{t('vouchers.required.quantity')}</FieldError>
              ) : (
                <FieldDescription>{t('vouchers.optional')}</FieldDescription>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="batch-maker">
              {t('vouchers.manufacturer')}
            </FieldLabel>
            <Input
              id="batch-maker"
              maxLength={120}
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            />
            <FieldDescription>{t('vouchers.optional')}</FieldDescription>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('producedOn') || undefined}>
              <FieldLabel htmlFor="batch-produced">
                {t('vouchers.producedOnLabel')}
              </FieldLabel>
              <Input
                id="batch-produced"
                type="date"
                max={today}
                value={producedOn}
                onChange={(e) => setProducedOn(e.target.value)}
                aria-invalid={show('producedOn') || undefined}
              />
              {show('producedOn') && (
                <FieldError>{t('vouchers.required.producedOn')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('expiresOn') || undefined}>
              <FieldLabel htmlFor="batch-expires">
                {t('vouchers.expiresOnLabel')}
              </FieldLabel>
              <Input
                id="batch-expires"
                type="date"
                min={producedOn || undefined}
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
                aria-invalid={show('expiresOn') || undefined}
              />
              {show('expiresOn') ? (
                <FieldError>{t('vouchers.required.expiresOn')}</FieldError>
              ) : (
                <FieldDescription>{t('vouchers.optional')}</FieldDescription>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="batch-notes">{t('vouchers.notes')}</FieldLabel>
            <Textarea
              id="batch-notes"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={registering.isLoading}>
              {registering.isLoading
                ? t('people.actions.working')
                : t('vouchers.registerBatch')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
