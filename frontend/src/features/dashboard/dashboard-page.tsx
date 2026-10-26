import { Link } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ActiveProjectDto,
  type DashboardDto,
  type FundingProjectDto,
  useDashboardGetQuery,
} from '@/api/generated/dashboard';
import { mayOpen } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  useDistrictName,
  useProduceName,
} from '@/features/insurance/use-names';
import { STAGES } from '@/features/projects/projects-search';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { TrendChart } from './trend-chart';
import { WaitingSection } from './waiting-section';

/** Roles the figures by role are listed in: the people WeGro works with first. */
const PEOPLE_ORDER = [
  'farmer',
  'investor',
  'buyer',
  'seller',
  'supplier',
  'warehouse',
  'insurer',
  'bank',
  'field_officer',
  'operations',
  'accounts',
  'admin',
  'auditor',
] as const;

/**
 * The office's dashboard, work first: headline counts, what is waiting for
 * this role, then funding progress, active projects, projects by stage,
 * all-time figures and 12-month trends. Fetched afresh on every visit.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const query = useDashboardGetQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const d = query.data?.data;
  return (
    <div className="grid gap-8">
      <PageHeader
        title={t('nav.dashboard')}
        description={
          d
            ? t('dashboard.asOf', { time: fmt.dateTime(d.asOf) })
            : t('dashboard.intro')
        }
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            {t('dashboard.refresh')}
          </Button>
        }
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {d && <Dashboard d={d} />}
    </div>
  );
}

function Dashboard({ d }: { d: DashboardDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const waiting = d.queues.reduce((n, q) => n + q.count, 0);
  const overdue = d.active.projects.filter((p) => p.overdue).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          tone="total"
          value={fmt.number(d.funding.openProjects)}
          label={t('dashboard.tiles.open')}
        />
        <StatCard
          tone="positive"
          value={`${fmt.number(d.funding.percentFunded)}%`}
          label={t('dashboard.tiles.raised')}
        />
        <StatCard
          value={fmt.number(d.active.count)}
          label={
            overdue > 0
              ? t('dashboard.tiles.activeOverdue', {
                  n: fmt.number(overdue),
                })
              : t('dashboard.tiles.active')
          }
        />
        <StatCard
          tone={waiting > 0 ? 'negative' : 'positive'}
          value={fmt.number(waiting)}
          label={t('dashboard.tiles.waiting')}
        />
      </div>
      <WaitingSection queues={d.queues} />
      <Funding d={d} />
      <Active d={d} />
      <Stages stages={d.stages} />
      <Figures d={d} />
      <Trends d={d} />
    </>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <div>
        <h2 id={id} className="text-xl font-bold">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** A project's name: a link where the role may open projects. */
function ProjectName({ id, name }: { id: string; name: string }) {
  const user = useAppSelector((s) => s.session.user!);
  const path = `/projects/${id}`;
  return mayOpen(user, path) ? (
    <Link
      to="/projects/$projectId"
      params={{ projectId: id }}
      className="font-semibold hover:underline"
    >
      {name}
    </Link>
  ) : (
    <span className="font-semibold">{name}</span>
  );
}

function Funding({ d }: { d: DashboardDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const f = d.funding;
  return (
    <Section
      id="funding-title"
      title={t('dashboard.fundingTitle')}
      description={t('dashboard.fundingText', {
        raised: fmt.taka(f.raised),
        target: fmt.taka(f.target),
        count: f.openProjects,
        n: fmt.number(f.openProjects),
      })}
    >
      {f.projects.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-muted-foreground">
          {t('dashboard.noFunding')}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {f.projects.map((p) => (
            <li key={p.project.id}>
              <FundingCard p={p} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FundingCard({ p }: { p: FundingProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const produce = useProduceName();
  const district = useDistrictName();
  return (
    <article className="grid h-full content-start gap-3 rounded-2xl border bg-card p-4">
      <div className="grid gap-0.5">
        <ProjectName id={p.project.id} name={p.project.name} />
        <p className="text-sm text-muted-foreground">
          {[
            produce(p.produceCode),
            district({ code: p.districtCode, name: p.districtCode }),
            p.farmer.name,
          ].join(' · ')}
        </p>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="font-semibold">{fmt.taka(p.raised)}</span>{' '}
            <span className="text-muted-foreground">
              {t('dashboard.ofTarget', { target: fmt.taka(p.target) })}
            </span>
          </span>
          <span className="font-semibold">{fmt.number(p.percentFunded)}%</span>
        </div>
        <Progress
          value={Math.min(100, Number(p.percentFunded))}
          aria-label={t('dashboard.fundedLabel', {
            name: p.project.name,
            percent: fmt.number(p.percentFunded),
          })}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {[
          t('dashboard.slots', {
            issued: fmt.number(p.issuedSlots),
            total: fmt.number(p.totalSlots),
          }),
          p.reservedSlots > 0 &&
            t('dashboard.reserved', {
              count: p.reservedSlots,
              n: fmt.number(p.reservedSlots),
            }),
          t('dashboard.daysOpen', {
            count: p.daysOpen,
            n: fmt.number(p.daysOpen),
          }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {p.pendingReservations > 0 && (
        <StatusPill tone="warning" appearance="soft" className="w-fit">
          {t('dashboard.pendingPayments', {
            count: p.pendingReservations,
            n: fmt.number(p.pendingReservations),
          })}
        </StatusPill>
      )}
    </article>
  );
}

function Active({ d }: { d: DashboardDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Section
      id="active-title"
      title={t('dashboard.activeTitle')}
      description={t('dashboard.activeText', {
        count: d.active.count,
        n: fmt.number(d.active.count),
      })}
    >
      {d.active.projects.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-muted-foreground">
          {t('dashboard.noActive')}
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card px-4">
          {d.active.projects.map((p) => (
            <li key={p.project.id}>
              <ActiveRow p={p} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ActiveRow({ p }: { p: ActiveProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const produce = useProduceName();
  const district = useDistrictName();
  return (
    <div className="grid gap-2 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-6">
      <div className="grid gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <ProjectName id={p.project.id} name={p.project.name} />
          {p.overdue && (
            <StatusPill tone="danger" appearance="soft">
              {t('dashboard.overdue')}
            </StatusPill>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          {[
            produce(p.produceCode),
            district({ code: p.districtCode, name: p.districtCode }),
            p.farmer.name,
          ].join(' · ')}
        </span>
      </div>
      <div className="text-sm">
        <span className="block text-muted-foreground">
          {t('dashboard.term')}
        </span>
        {p.startedOn ? fmt.date(p.startedOn) : '—'} –{' '}
        {p.plannedEndOn ? fmt.date(p.plannedEndOn) : '—'}
      </div>
      <div className="grid gap-0.5 text-sm">
        <span>
          <span className="text-muted-foreground">
            {t('dashboard.inputs')}:{' '}
          </span>
          {t('dashboard.inputsValue', {
            spent: fmt.taka(p.inputsSpent),
            committed: fmt.taka(p.inputsCommitted),
          })}
        </span>
        <span className="text-muted-foreground">
          {[
            p.lastFieldRecordAt
              ? t('dashboard.lastUpdate', {
                  when: fmt.relative(p.lastFieldRecordAt),
                })
              : t('dashboard.noUpdate'),
            p.openClaims > 0 &&
              t('dashboard.openClaims', {
                count: p.openClaims,
                n: fmt.number(p.openClaims),
              }),
            p.openListings > 0 &&
              t('dashboard.openListings', {
                count: p.openListings,
                n: fmt.number(p.openListings),
              }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
    </div>
  );
}

function Stages({ stages }: { stages: DashboardDto['stages'] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const linked = mayOpen(user, '/projects');
  return (
    <Section id="stages-title" title={t('dashboard.stagesTitle')}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {STAGES.map((s) => {
          const tile = (
            <StatCard
              className="h-full"
              value={fmt.number(stages[s] ?? 0)}
              label={t(`projects.stage.${s}`)}
            />
          );
          return (
            <li key={s}>
              {linked ? (
                <Link
                  to="/projects"
                  search={{ stage: s }}
                  className="block h-full rounded-lg outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {tile}
                </Link>
              ) : (
                tile
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Figures({ d }: { d: DashboardDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const f = d.figures;
  const people = PEOPLE_ORDER.filter((r) => (f.participants[r] ?? 0) > 0);
  return (
    <Section
      id="figures-title"
      title={t('dashboard.figuresTitle')}
      description={t('dashboard.figuresAsOf', {
        time: fmt.dateTime(d.figuresAsOf),
      })}
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          tone="positive"
          value={fmt.takaShort(f.fundingRaised)}
          label={t('dashboard.figures.fundingRaised')}
        />
        <StatCard
          tone="positive"
          value={fmt.takaShort(f.salesIncome)}
          label={t('dashboard.figures.salesIncome')}
        />
        <StatCard
          tone="positive"
          value={fmt.takaShort(f.payoutsPaid)}
          label={t('dashboard.figures.payoutsPaid')}
        />
        <StatCard
          tone="total"
          value={fmt.takaShort(f.inputsSpent)}
          label={t('dashboard.figures.inputsSpent')}
        />
        <StatCard
          tone="total"
          value={fmt.takaShort(f.insuranceApproved)}
          label={t('dashboard.figures.insuranceApproved')}
        />
        <StatCard
          tone="negative"
          value={fmt.takaShort(f.refunded)}
          label={t('dashboard.figures.refunded')}
        />
      </div>
      {people.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-semibold">{t('dashboard.peopleTitle')}</h3>
          <ul className="flex flex-wrap gap-2">
            {people.map((r) => (
              <li
                key={r}
                className="rounded-full border bg-card px-3 py-1.5 text-sm"
              >
                <span className="font-semibold">
                  {fmt.number(f.participants[r] ?? 0)}
                </span>{' '}
                <span className="text-muted-foreground">{t(`roles.${r}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Trends({ d }: { d: DashboardDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const tr = d.trends;
  const month = (m: string) => fmt.month(`${m}-15`).split(' ')[0] ?? m;
  const monthLong = (m: string) => fmt.month(`${m}-15`);
  const money = {
    format: (v: number) => fmt.taka(v.toFixed(2)),
    tick: (v: number) => fmt.takaShort(v),
    month,
    monthLong,
    whole: false,
  };
  const counts = {
    format: (v: number) => fmt.number(v),
    tick: (v: number) => fmt.compact(v),
    month,
    monthLong,
    whole: true,
  };
  const charts = [
    { key: 'fundingRaised', values: tr.fundingRaised.map(Number), ...money },
    { key: 'salesIncome', values: tr.salesIncome.map(Number), ...money },
    { key: 'payoutsPaid', values: tr.payoutsPaid.map(Number), ...money },
    { key: 'projectsStarted', values: tr.projectsStarted, ...counts },
    { key: 'projectsFinished', values: tr.projectsFinished, ...counts },
  ] as const;
  return (
    <Section
      id="trends-title"
      title={t('dashboard.trendsTitle')}
      description={t('dashboard.trendsText')}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {charts.map((c) => (
          <TrendChart
            key={c.key}
            title={t(`dashboard.trend.${c.key}`)}
            months={tr.months}
            values={c.values}
            format={c.format}
            tick={c.tick}
            month={c.month}
            monthLong={c.monthLong}
            whole={c.whole}
          />
        ))}
      </div>
    </Section>
  );
}
