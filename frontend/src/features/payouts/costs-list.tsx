import { Link, useNavigate } from '@tanstack/react-router';
import { ImageOff, Plus, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type CostDto,
  useSettlementListAllCostsQuery,
  useSettlementVoidCostMutation,
} from '@/api/generated/settlement';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { AddCostDialog } from './add-cost-dialog';
import { COST_CATEGORIES, type CostCategory, FRESH } from './payouts-utils';

const PAGE_SIZE = 20;
type Tab = 'all' | CostCategory | 'voided';
const TABS: readonly Tab[] = ['all', ...COST_CATEGORIES, 'voided'];

/**
 * Costs across projects, newest first: what Accounts entered with each
 * bill. Tabbed by category and searched by project title or note.
 */
export function CostsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [adding, setAdding] = useState(false);
  const tab = TABS.find((x) => x === search.tab) ?? 'all';
  const page = search.page ?? 1;
  const query = useSettlementListAllCostsQuery(
    {
      page,
      limit: PAGE_SIZE,
      q: search.q,
      ...(tab === 'voided'
        ? { voidedOnly: true }
        : tab === 'all'
          ? {}
          : { category: tab }),
    },
    FRESH,
  );
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/payouts/costs',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const rows = query.data?.data ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.costs')}
        description={t('payouts.costsIntro')}
        actions={
          actsAs(role, 'accounts') && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> {t('payouts.addCost')}
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
            onClick={() => set({ tab: x === 'all' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {x === 'all' || x === 'voided'
              ? t(`payouts.costTab.${x}`)
              : t(`payouts.costCategory.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('payouts.searchCosts')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && rows.length === 0 && (
        <EmptyState
          icon={Receipt}
          title={search.q ? t('payouts.noCostMatch') : t('payouts.noCosts')}
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {rows.length > 0 && (
        <>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {rows.map((c) => (
              <li key={c.id}>
                <CostRow cost={c} withProject />
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
                  to: '/payouts/costs',
                  search: { ...search, page: p },
                })
              }
            />
          )}
        </>
      )}
      {adding && <AddCostDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function BillThumb({ cost: c }: { cost: CostDto }) {
  const { t } = useTranslation();
  const { url, error } = useApiFile(c.photoUrl);
  if (!c.photoUrl) return <div className="size-14 shrink-0" />;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img
        src={url}
        alt={t('payouts.billAlt')}
        className="size-14 rounded-lg bg-muted object-cover"
      />
    </a>
  ) : (
    <div
      className={cn(
        'grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground',
        !error && 'animate-pulse',
      )}
    >
      {error && <ImageOff aria-hidden className="size-4" />}
    </div>
  );
}

/** One cost: its bill, category, amount, day, note, who entered it; voiding for Accounts. */
export function CostRow({
  cost: c,
  withProject = false,
}: {
  cost: CostDto;
  withProject?: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const [voiding, setVoiding] = useState(false);
  const voided = c.status === 'voided';
  return (
    <div className="flex flex-wrap items-start gap-3 py-3">
      <BillThumb cost={c} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className={cn('font-medium', voided && 'line-through')}>
          {t(`payouts.costCategory.${c.category}`)} · {fmt.taka(c.amount)}
        </p>
        <p className="text-sm text-muted-foreground">
          {fmt.date(c.incurredOn)} ·{' '}
          {t('payouts.enteredBy', { name: c.enteredBy.name })}
          {withProject && (
            <>
              {' · '}
              <Link
                to="/payouts/projects/$projectId"
                params={{ projectId: c.projectId }}
                className="font-medium text-foreground hover:underline"
              >
                {c.project.name}
              </Link>
            </>
          )}
        </p>
        <p translate="no" className="text-sm whitespace-pre-line">
          {c.note}
        </p>
        {voided && (
          <span className="mt-1 flex">
            <StatusPill tone="neutral" appearance="soft">
              {t('payouts.voidedBy', { name: c.voidedBy?.name ?? '' })}
            </StatusPill>
          </span>
        )}
      </div>
      {!voided && actsAs(role, 'accounts') && (
        <Button variant="ghost" size="sm" onClick={() => setVoiding(true)}>
          {t('payouts.void')}
        </Button>
      )}
      {voiding && <VoidDialog cost={c} onClose={() => setVoiding(false)} />}
    </div>
  );
}

function VoidDialog({
  cost: c,
  onClose,
}: {
  cost: CostDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [voidCost, voiding] = useSettlementVoidCostMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await voidCost({ id: c.id }).unwrap();
      toast.success(t('payouts.costVoided'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payouts.voidTitle')}</DialogTitle>
          <DialogDescription>
            {t('payouts.voidText', {
              category: t(`payouts.costCategory.${c.category}`),
              amount: fmt.taka(c.amount),
            })}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={voiding.isLoading}
            onClick={() => void go()}
          >
            {voiding.isLoading
              ? t('people.actions.working')
              : t('payouts.void')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
