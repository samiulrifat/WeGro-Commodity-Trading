import { Link, useNavigate } from '@tanstack/react-router';
import { PackagePlus, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ReceiptDto,
  type WarehouseListApiArg,
  useWarehouseListQuery,
} from '@/api/generated/warehouse';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { IssueDialog } from './issue-dialog';
import {
  dayAfter,
  EXPIRING_DAYS,
  receiptNumber,
  type ReceiptListSearch,
  type ReceiptTab,
} from './receipt-utils';
import { ReceiptStatus } from './status';

const PAGE_SIZE = 12;
const TABS: ReceiptTab[] = [
  'all',
  'issued',
  'expiring',
  'pending_handover',
  'listed',
  'sold',
  'collected',
  'sold_out',
];

/**
 * Warehouse receipts as cards: what is stored, for whom, where, until when.
 * Tabs by status and those due a re-check; searched by project words, the
 * farmer or the printed receipt number. `handovers` lists buy-back offers.
 */
export function ReceiptsList({
  search,
  handovers = false,
}: {
  search: ReceiptListSearch;
  handovers?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [issuing, setIssuing] = useState(false);
  const page = search.page ?? 1;
  const tab: ReceiptTab = handovers
    ? 'pending_handover'
    : (search.tab ?? 'all');
  const arg: WarehouseListApiArg = {
    page,
    limit: PAGE_SIZE,
    q: search.q,
    ...(tab === 'expiring'
      ? { expiresBy: dayAfter(EXPIRING_DAYS) }
      : tab !== 'all'
        ? { status: tab }
        : {}),
  };
  const query = useWarehouseListQuery(arg);
  const path = handovers ? '/warehouse/handovers' : '/warehouse';
  const set = (patch: Partial<ReceiptListSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const intro = handovers
    ? t(
        `warehouse.handoversIntro.${role === 'field_officer' ? 'officer' : 'office'}`,
      )
    : t(`warehouse.intro.${introKey(role)}`);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={handovers ? t('nav.sub.handovers') : t('nav.sub.allReceipts')}
        description={intro}
        actions={
          role === 'warehouse' &&
          !handovers && (
            <Button onClick={() => setIssuing(true)}>
              <PackagePlus /> {t('warehouse.issue')}
            </Button>
          )
        }
      />
      {!handovers && (
        <div
          role="tablist"
          aria-label={t('warehouse.tabs')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {TABS.map((x) => (
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
              {t(`warehouse.tab.${x}`)}
            </button>
          ))}
        </div>
      )}
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('warehouse.search')}
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
          icon={Warehouse}
          title={
            search.q
              ? t('warehouse.noMatch')
              : handovers
                ? t('warehouse.noHandovers')
                : t('warehouse.none')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((r) => (
              <li key={r.id}>
                <ReceiptCard receipt={r} />
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
      {issuing && <IssueDialog onClose={() => setIssuing(false)} />}
    </div>
  );
}

const introKey = (role: string) =>
  role === 'warehouse'
    ? 'operator'
    : role === 'farmer'
      ? 'farmer'
      : role === 'buyer'
        ? 'buyer'
        : role === 'field_officer'
          ? 'officer'
          : 'office';

/** One receipt: what is held, how much, whose, where and until when. */
export function ReceiptCard({ receipt: r }: { receipt: ReceiptDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const produce =
    i18n.resolvedLanguage === 'bn' && r.produce.nameBn
      ? r.produce.nameBn
      : r.produce.name;
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="font-bold leading-snug">
            <Link
              to="/warehouse/receipts/$receiptId"
              params={{ receiptId: r.id }}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {produce} ·{' '}
              {t('warehouse.quantityOf', {
                quantity: fmt.number(r.quantity),
                unit: r.produce.unit,
              })}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{receiptNumber(r.id)}</p>
        </div>
      </div>
      <p className="truncate text-sm">
        <span className="font-medium">{r.owner.name}</span>
        <span className="text-muted-foreground"> · {r.project.name}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {r.site.name} ·{' '}
        {t('warehouse.validUntil', { date: fmt.date(r.expiresOn) })}
      </p>
      <ReceiptStatus receipt={r} />
    </article>
  );
}
