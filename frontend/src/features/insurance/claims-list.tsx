import { Link, useNavigate } from '@tanstack/react-router';
import { FileWarning, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ClaimDto,
  type InsuranceListClaimsApiArg,
  useInsuranceListClaimsQuery,
} from '@/api/generated/insurance';
import { actsAs } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { FRESH } from './insurance-utils';
import { OpenClaimDialog } from './open-claim-dialog';
import { ClaimStatusPill } from './status';
import { useEventTypeName } from './use-names';

const PAGE_SIZE = 12;
type Tab =
  'all' | 'triggered' | 'under_review' | 'payment_due' | 'paid' | 'rejected';
const TABS: readonly Tab[] = [
  'all',
  'triggered',
  'under_review',
  'payment_due',
  'paid',
  'rejected',
];
/** Accounts start where their work is: the payments to record. */
const ACCOUNTS_TABS: readonly Tab[] = [
  'payment_due',
  'all',
  'triggered',
  'under_review',
  'paid',
  'rejected',
];

function filter(tab: Tab): Partial<InsuranceListClaimsApiArg> {
  if (tab === 'all') return {};
  if (tab === 'payment_due') return { paymentDue: true };
  return { status: tab };
}

/**
 * Claims in the role's reach: an insurer's projects, an officer's farmers,
 * a farmer's own, every one for the office. Tabbed by where they stand and
 * searched by project, event type or farmer.
 */
export function ClaimsList({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const [opening, setOpening] = useState(false);
  const tabs = role === 'accounts' ? ACCOUNTS_TABS : TABS;
  const tab = tabs.find((x) => x === search.tab) ?? tabs[0]!;
  const page = search.page ?? 1;
  const query = useInsuranceListClaimsQuery(
    { page, limit: PAGE_SIZE, q: search.q, ...filter(tab) },
    FRESH,
  );
  const set = (patch: Partial<MarketSearch>) =>
    void navigate({
      to: '/insurance/claims',
      search: { ...search, ...patch, page: undefined },
    });
  const meta = query.data?.meta;
  const opens = actsAs(role, 'admin') || role === 'field_officer';

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.claims')}
        description={t(`insurance.claimsIntro.${introKey(role)}`)}
        actions={
          opens && (
            <Button onClick={() => setOpening(true)}>
              <Plus /> {t('insurance.move.openClaim')}
            </Button>
          )
        }
      />
      <div
        role="tablist"
        aria-label={t('market.tabs')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {tabs.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => set({ tab: x === tabs[0] ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`insurance.claimTab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('insurance.searchClaims')}
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
          icon={FileWarning}
          title={
            search.q ? t('insurance.noClaimMatch') : t('insurance.noClaims')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {query.data.data.map((c) => (
              <li key={c.id}>
                <ClaimCard claim={c} />
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
                  to: '/insurance/claims',
                  search: { ...search, page: p },
                })
              }
            />
          )}
        </>
      )}
      {opening && <OpenClaimDialog onClose={() => setOpening(false)} />}
    </div>
  );
}

const introKey = (role: string) =>
  role === 'insurer'
    ? 'insurer'
    : role === 'field_officer'
      ? 'officer'
      : role === 'farmer'
        ? 'farmer'
        : role === 'accounts'
          ? 'accounts'
          : 'office';

/** One claim: the event, the project, the damage, where it stands, the money. */
function ClaimCard({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const eventName = useEventTypeName();
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">
          <Link
            to="/insurance/claims/$claimId"
            params={{ claimId: c.id }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {eventName(c.event.eventType)} ·{' '}
            {t('insurance.damage', { percent: fmt.number(c.damagePercent, 1) })}
          </Link>
        </h3>
        <p className="truncate text-sm text-muted-foreground">
          {c.project.name}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('insurance.happenedOn', { date: fmt.date(c.event.occurredOn) })}
        {c.openedAt && (
          <>
            {' · '}
            {t('insurance.openedOn', { date: fmt.date(c.openedAt) })}
          </>
        )}
      </p>
      {c.approvedAmount && (
        <p className="text-sm font-semibold">{fmt.taka(c.approvedAmount)}</p>
      )}
      <span className="flex flex-wrap gap-1.5">
        <ClaimStatusPill claim={c} />
      </span>
    </article>
  );
}

/** A claim in a project's list: the event, the damage, where it stands. */
export function ClaimRow({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const eventName = useEventTypeName();
  return (
    <Link
      to="/insurance/claims/$claimId"
      params={{ claimId: c.id }}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="font-medium">
          {eventName(c.event.eventType)} ·{' '}
          {t('insurance.damage', { percent: fmt.number(c.damagePercent, 1) })}
        </span>
        <span className="text-sm text-muted-foreground">
          {fmt.date(c.event.occurredOn)}
          {c.approvedAmount && <> · {fmt.taka(c.approvedAmount)}</>}
        </span>
      </span>
      <ClaimStatusPill claim={c} />
    </Link>
  );
}
