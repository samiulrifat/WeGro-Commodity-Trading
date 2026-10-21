import { Link, useNavigate } from '@tanstack/react-router';
import { PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type VoucherSaleDto,
  type VouchersListSalesApiArg,
  useVouchersCancelSaleMutation,
  useVouchersConfirmSaleMutation,
  useVouchersListSalesQuery,
} from '@/api/generated/vouchers';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { SaleStatus } from './status';
import type { SaleListSearch, SaleTab } from './voucher-search';

const PAGE_SIZE = 20;
const TABS: SaleTab[] = ['pending', 'confirmed', 'cancelled', 'expired', 'all'];
const SALE_CANCELLERS = new Set([
  'admin',
  'supplier',
  'farmer',
  'field_officer',
]);

/**
 * Goods suppliers handed over against vouchers. Pending ones wait for the
 * farmer's field officer, who confirms them here; searched by sale number,
 * supplier or farmer.
 */
export function SalesList({ search }: { search: SaleListSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const page = search.page ?? 1;
  const tab: SaleTab = search.tab ?? 'pending';
  const arg: VouchersListSalesApiArg = {
    page,
    limit: PAGE_SIZE,
    q: search.q,
    ...(tab !== 'all' ? { status: tab } : {}),
  };
  const query = useVouchersListSalesQuery(arg);
  const set = (patch: Partial<SaleListSearch>) =>
    void navigate({
      to: '/vouchers/sales',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const intro =
    role === 'field_officer'
      ? 'officer'
      : role === 'supplier'
        ? 'supplier'
        : 'office';

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.inputSales')}
        description={t(`vouchers.salesIntro.${intro}`)}
      />
      <div
        role="tablist"
        aria-label={t('vouchers.tabs')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => set({ tab: x === 'pending' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {x === 'all'
              ? t('vouchers.tab.all')
              : t(`vouchers.saleStatus.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('vouchers.searchSales')}
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
          icon={PackageCheck}
          title={search.q ? t('vouchers.noSaleMatch') : t('vouchers.noSales')}
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-3">
            {query.data.data.map((s) => (
              <li key={s.id}>
                <SaleItem sale={s} showVoucher />
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
                  to: '/vouchers/sales',
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

type SaleMove = 'confirm' | 'cancel';

/** One sale: who sold what to whom, its batches, and the moves on it. */
export function SaleItem({
  sale: s,
  showVoucher = false,
}: {
  sale: VoucherSaleDto;
  showVoucher?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((st) => st.session.user!.role);
  const [move, setMove] = useState<SaleMove | null>(null);
  const bengali = i18n.resolvedLanguage === 'bn';
  const pending = s.status === 'pending';
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">
            {t('vouchers.saleNumber', { id: fmt.number(s.id) })} ·{' '}
            {t('vouchers.quantityOf', {
              quantity: fmt.number(s.quantity),
              unit: s.input.unit,
            })}{' '}
            {bengali ? s.input.nameBn : s.input.name}
          </h3>
          <SaleStatus status={s.status} />
        </div>
        <p className="text-sm">
          <span className="font-semibold">{fmt.taka(s.amount)}</span>
          <span className="text-muted-foreground">
            {' · '}
            {t('vouchers.soldBy', {
              supplier: s.supplier.name,
              farmer: s.farmer.name,
            })}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {t('vouchers.recordedAt', { at: fmt.dateTime(s.recordedAt) })}
          {pending && (
            <> · {t('vouchers.confirmBy', { at: fmt.dateTime(s.expiresAt) })}</>
          )}
        </p>
        {s.batches.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('vouchers.lots')}{' '}
            {s.batches.map((b, i) => (
              <span key={b.id}>
                {i > 0 && ', '}
                <a
                  href={`/verify/batch/${b.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {b.lotNumber}
                </a>
              </span>
            ))}
          </p>
        )}
        {showVoucher && (
          <Link
            to="/vouchers/$voucherId"
            params={{ voucherId: s.voucherId }}
            className="w-fit text-sm font-medium text-brand hover:underline"
          >
            {t('vouchers.openVoucher', { project: s.project.name })}
          </Link>
        )}
      </div>
      {pending && (role === 'field_officer' || SALE_CANCELLERS.has(role)) && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {role === 'field_officer' && (
            <Button onClick={() => setMove('confirm')}>
              {t('vouchers.saleMove.confirm')}
            </Button>
          )}
          {SALE_CANCELLERS.has(role) && (
            <Button variant="outline" onClick={() => setMove('cancel')}>
              {t('vouchers.saleMove.cancel')}
            </Button>
          )}
        </div>
      )}
      {move && (
        <SaleMoveDialog sale={s} move={move} onClose={() => setMove(null)} />
      )}
    </article>
  );
}

function SaleMoveDialog({
  sale: s,
  move,
  onClose,
}: {
  sale: VoucherSaleDto;
  move: SaleMove;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [confirm, confirming] = useVouchersConfirmSaleMutation();
  const [cancel, cancelling] = useVouchersCancelSaleMutation();
  const [error, setError] = useState<ApiError | null>(null);
  const busy = confirming.isLoading || cancelling.isLoading;

  async function go() {
    setError(null);
    try {
      await (
        move === 'confirm' ? confirm({ id: s.id }) : cancel({ id: s.id })
      ).unwrap();
      toast.success(t(`vouchers.saleMoved.${move}`));
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
            {t(`vouchers.saleMoveTitle.${move}`, { id: fmt.number(s.id) })}
          </DialogTitle>
          <DialogDescription>
            {t(`vouchers.saleMoveText.${move}`, {
              quantity: fmt.number(s.quantity),
              unit: s.input.unit,
              farmer: s.farmer.name,
              amount: fmt.taka(s.amount),
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
            {busy
              ? t('people.actions.working')
              : t(`vouchers.saleMove.${move}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
