import { Link } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Printer } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type BatchDto,
  useBatchesFindOneQuery,
} from '@/api/generated/vouchers';
import { PrintSheet } from '@/components/print-sheet';
import { ErrorState, LoadingState } from '@/components/states';
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
import { useFormat } from '@/i18n/use-format';
import { latinDigits } from '@/lib/format';
import { useAppSelector } from '@/store/hooks';
import { type BatchesBase, BatchStatus } from './batches-list';
import { labelPages, MAX_LABELS, PER_SHEET } from './labels';

/** One registered lot: its details, its QR, and printing labels for its bags. */
export function BatchPage({ id, base }: { id: string; base: BatchesBase }) {
  const { t } = useTranslation();
  const query = useBatchesFindOneQuery({ id });
  const back = (
    <Link
      to={base}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {base === '/batches' ? t('nav.batches') : t('nav.sub.inputBatches')}
    </Link>
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
  const b = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header batch={b} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Details batch={b} />
        <BatchQr batch={b} />
      </div>
    </div>
  );
}

function Header({ batch: b }: { batch: BatchDto }) {
  const { t, i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <BatchStatus batch={b} />
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {t('vouchers.lotLabel', { lot: b.lotNumber })}
        </h1>
        <p className="text-white/85">
          {bengali ? b.input.nameBn : b.input.name}
          {b.manufacturer && ` · ${b.manufacturer}`}
        </p>
      </div>
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

function Details({ batch: b }: { batch: BatchDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.batchDetails')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('vouchers.supplier')}>{b.supplier.name}</Row>
          <Row label={t('vouchers.producedOnLabel')}>
            {fmt.date(b.producedOn)}
          </Row>
          <Row label={t('vouchers.expiresOnLabel')}>
            {b.expiresOn ? fmt.date(b.expiresOn) : t('vouchers.noExpiry')}
          </Row>
          {b.quantity != null && (
            <Row label={t('vouchers.batchSize')}>
              {t('vouchers.quantityOf', {
                quantity: fmt.number(b.quantity),
                unit: b.input.unit,
              })}
            </Row>
          )}
          {b.registeredAt && (
            <Row label={t('vouchers.registeredAt')}>
              {fmt.dateTime(b.registeredAt)}
            </Row>
          )}
        </dl>
        {b.notes && (
          <p className="mt-4 whitespace-pre-line text-muted-foreground">
            {b.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BatchQr({ batch: b }: { batch: BatchDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const registered = b.status === 'registered';
  const { url, error } = useApiFile(
    registered ? `/api/verify/batches/${b.id}/qr.svg` : null,
  );
  const [choosing, setChoosing] = useState(false);
  const [printing, setPrinting] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vouchers.batchQrTitle')}</CardTitle>
        <CardDescription>
          {registered ? t('vouchers.batchQrText') : t('vouchers.batchWaiting')}
        </CardDescription>
      </CardHeader>
      {registered && (
        <CardContent className="grid justify-items-center gap-3">
          {url ? (
            <img
              src={url}
              alt={t('vouchers.qrAlt')}
              className="size-48 rounded-lg border bg-white p-2"
            />
          ) : error ? (
            <p className="text-sm text-destructive">{t('vouchers.qrFailed')}</p>
          ) : (
            <div className="size-48 animate-pulse rounded-lg bg-muted" />
          )}
          <a
            href={`/verify/batch/${b.id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: 'ghost',
              className: 'w-full',
            })}
          >
            <ExternalLink /> {t('vouchers.openCheck')}
          </a>
          {role === 'supplier' && (
            <Button
              className="w-full"
              disabled={!url}
              onClick={() => setChoosing(true)}
            >
              <Printer /> {t('vouchers.printLabels')}
            </Button>
          )}
        </CardContent>
      )}
      {choosing && (
        <LabelCountDialog
          batch={b}
          onClose={() => setChoosing(false)}
          onPrint={(n) => {
            setChoosing(false);
            setPrinting(n);
          }}
        />
      )}
      {printing && url && (
        <LabelSheet
          batch={b}
          qr={url}
          count={printing}
          onDone={() => setPrinting(null)}
        />
      )}
    </Card>
  );
}

function LabelCountDialog({
  batch: b,
  onClose,
  onPrint,
}: {
  batch: BatchDto;
  onClose: () => void;
  onPrint: (n: number) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const start = b.quantity && b.quantity <= MAX_LABELS ? b.quantity : PER_SHEET;
  const [count, setCount] = useState(String(start));
  const [tried, setTried] = useState(false);
  const n = Number(latinDigits(count));
  const bad = !Number.isInteger(n) || n < 1 || n > MAX_LABELS;
  const sheets = bad ? 0 : Math.ceil(n / PER_SHEET);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!bad) onPrint(n);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vouchers.printLabels')}</DialogTitle>
          <DialogDescription>
            {t('vouchers.printLabelsText', { perSheet: fmt.number(PER_SHEET) })}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="grid gap-5">
          <Field data-invalid={(tried && bad) || undefined}>
            <FieldLabel htmlFor="label-count">
              {t('vouchers.labelCount')}
            </FieldLabel>
            <Input
              id="label-count"
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-invalid={(tried && bad) || undefined}
            />
            {tried && bad ? (
              <FieldError>
                {t('vouchers.required.labelCount', {
                  max: fmt.number(MAX_LABELS),
                })}
              </FieldError>
            ) : (
              <FieldDescription>
                {sheets > 0 && t('vouchers.sheets', { count: sheets })}
              </FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit">
              <Printer /> {t('vouchers.print')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A4 sheets of stickers, one per bag: the QR, the product, the lot and its use-by day. */
function LabelSheet({
  batch: b,
  qr,
  count,
  onDone,
}: {
  batch: BatchDto;
  qr: string;
  count: number;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <PrintSheet className="label-sheet" onDone={onDone}>
      {labelPages(count).map((size, page) => (
        <div key={page} className="label-page">
          {Array.from({ length: size }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-[2mm] overflow-hidden px-[2.5mm] text-[8pt] leading-tight"
            >
              <img src={qr} alt="" className="size-[30mm] shrink-0" />
              <div className="grid min-w-0 gap-[1mm]">
                <strong className="text-[9pt] break-words">
                  {bengali ? b.input.nameBn : b.input.name}
                </strong>
                <span className="break-all">
                  {t('vouchers.lotLabel', { lot: b.lotNumber })}
                </span>
                <span>
                  {b.expiresOn
                    ? t('vouchers.expires', { date: fmt.date(b.expiresOn) })
                    : t('vouchers.noExpiry')}
                </span>
                <span className="text-[6.5pt]">
                  {t('vouchers.scanToCheck')}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </PrintSheet>
  );
}
