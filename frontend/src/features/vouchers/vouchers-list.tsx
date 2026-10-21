import { useNavigate } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { Plus, Ticket } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type VoucherDto,
  type VouchersListApiArg,
  useVouchersListQuery,
} from '@/api/generated/vouchers';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { ProposeDialog } from './propose-dialog';
import { VoucherStatus } from './status';
import {
  canProposeVouchers,
  usedShare,
  type VoucherListSearch,
  type VoucherTab,
} from './voucher-search';

const PAGE_SIZE = 12;
const OFFICE = new Set([
  'super_admin',
  'admin',
  'operations',
  'accounts',
  'auditor',
]);

/**
 * Vouchers as cards: what input, for which farmer and project, what is left.
 * Tabs by status (and those idle past their limit), searched by project
 * title words or the farmer. `pending` shows those waiting for Accounts.
 */
export function VouchersList({
  search,
  pending = false,
}: {
  search: VoucherListSearch;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [proposing, setProposing] = useState(false);
  const page = search.page ?? 1;
  const tab: VoucherTab = search.tab ?? 'all';
  const arg: VouchersListApiArg = {
    page,
    limit: PAGE_SIZE,
    q: search.q,
    ...(pending
      ? { status: 'proposed' }
      : tab === 'inactive'
        ? { inactive: true }
        : tab !== 'all'
          ? { status: tab }
          : {}),
  };
  const query = useVouchersListQuery(arg);
  const path = pending ? '/vouchers/pending' : '/vouchers';
  const set = (patch: Partial<VoucherListSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });
  const tabs: VoucherTab[] = OFFICE.has(role)
    ? ['all', 'active', 'inactive', 'rejected', 'cancelled']
    : ['all', 'active', 'cancelled'];
  const meta = query.data?.meta;
  const title = pending
    ? t('nav.sub.pendingVouchers')
    : role === 'supplier'
      ? t('vouchers.forSupplier')
      : role === 'farmer'
        ? t('vouchers.mine')
        : t('nav.sub.allVouchers');

  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        description={
          pending
            ? t('vouchers.pendingIntro')
            : t(`vouchers.intro.${introKey(role)}`)
        }
        actions={
          canProposeVouchers(role) && (
            <Button onClick={() => setProposing(true)}>
              <Plus /> {t('vouchers.propose')}
            </Button>
          )
        }
      />
      {!pending && (
        <div
          role="tablist"
          aria-label={t('vouchers.tabs')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {tabs.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={tab === x}
              onClick={() => set({ tab: x === 'all' ? undefined : x })}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                tab === x
                  ? 'border-ink bg-ink text-white'
                  : 'bg-card hover:bg-muted',
              )}
            >
              {t(`vouchers.tab.${x}`)}
            </button>
          ))}
        </div>
      )}
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('vouchers.search')}
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
          icon={Ticket}
          title={
            search.q
              ? t('vouchers.noMatch')
              : pending
                ? t('vouchers.noneWaiting')
                : t('vouchers.none')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((v) => (
              <li key={v.id}>
                <VoucherCard voucher={v} />
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
      {proposing && <ProposeDialog onClose={() => setProposing(false)} />}
    </div>
  );
}

const introKey = (role: string) =>
  role === 'supplier'
    ? 'supplier'
    : role === 'farmer'
      ? 'farmer'
      : role === 'field_officer'
        ? 'officer'
        : 'office';

/** One voucher: the input and how much, whose, and what is left of it. */
export function VoucherCard({ voucher: v }: { voucher: VoucherDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="font-bold leading-snug">
            <Link
              to="/vouchers/$voucherId"
              params={{ voucherId: v.id }}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {bengali ? v.input.nameBn : v.input.name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('vouchers.quantityOf', {
              quantity: fmt.number(v.quantity),
              unit: v.input.unit,
            })}{' '}
            ·{' '}
            {t('vouchers.at', {
              price: fmt.taka(v.unitPrice),
              unit: v.input.unit,
            })}
          </p>
        </div>
        <p className="shrink-0 text-right font-bold">{fmt.taka(v.value)}</p>
      </div>
      <p className="truncate text-sm">
        <span className="font-medium">{v.farmer.name}</span>
        <span className="text-muted-foreground"> · {v.project.name}</span>
      </p>
      <VoucherStatus voucher={v} />
      <div className="grid gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t('vouchers.used', {
              spent: fmt.number(v.spentQuantity),
              quantity: fmt.number(v.quantity),
              unit: v.input.unit,
            })}
          </span>
          <span className="font-semibold">
            {t('vouchers.left', { amount: fmt.taka(v.availableBalance) })}
          </span>
        </div>
        <Progress value={usedShare(v)} aria-label={t('vouchers.usage')} />
      </div>
    </article>
  );
}
