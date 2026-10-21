import { Link } from '@tanstack/react-router';
import { ArrowLeft, Flame, ShieldCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ProjectDto,
  useProjectsFindOneQuery,
} from '@/api/generated/projects';
import { ErrorState, LoadingState } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/use-format';
import { ProjectVouchers } from '@/features/vouchers/project-vouchers';
import { useAppSelector } from '@/store/hooks';
import { FavouriteButton, Place, ProjectPhoto } from './project-card';
import { annualized, installments, shortPercent } from './project-math';
import { InvestBar, Simulator } from './simulator';
import { StaffPanel, Timeline } from './staff-panel';
import { StagePill } from './stage-pill';

/**
 * One project, as investors see it in WeGro's app: photo, the estimate and
 * terms, funding so far, a return simulator and Invest Now; for staff also
 * the stage moves, the ledger check and who holds slots.
 */
export function ProjectPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const query = useProjectsFindOneQuery({ id });
  const back = (
    <Link
      to="/projects"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t('nav.projects')}
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
  const p = query.data.data;
  const investor = role === 'investor';
  const open = p.stage === 'open_for_funding';

  return (
    <div className="grid gap-6 pb-24">
      {back}
      <Hero project={p} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <KeyFacts project={p} />
          <Funding project={p} />
          {open && <Simulator project={p} />}
          {p.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('projects.why')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                  {p.description}
                </p>
              </CardContent>
            </Card>
          )}
          <Details project={p} />
        </div>
        <div className="grid gap-6">
          <StaffPanel project={p} />
          <ProjectVouchers project={p} />
          <Timeline project={p} />
        </div>
      </div>
      {investor && open && p.availableSlots > 0 && <InvestBar project={p} />}
    </div>
  );
}

function Hero({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden rounded-2xl bg-ink text-white">
      <ProjectPhoto
        project={p}
        className="absolute inset-0 size-full opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
      <div className="relative grid min-h-64 content-between gap-6 p-5 sm:min-h-80 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <StagePill stage={p.stage} />
          <Tag>
            {p.durationType === 'long_term'
              ? t('projects.tab.long_term')
              : t('projects.tab.short_term')}
          </Tag>
          {p.estimatedReturn.minPercent !== p.estimatedReturn.maxPercent && (
            <Tag>{t('projects.variableReturn')}</Tag>
          )}
          {p.insured && (
            <Tag>
              <ShieldCheck aria-hidden className="size-3.5" />
              {t('projects.insured')}
            </Tag>
          )}
          <FavouriteButton
            project={p}
            className="ml-auto bg-white/15 text-white hover:bg-white/25 hover:text-white"
          />
        </div>
        <div className="grid gap-2">
          <h1 className="text-2xl font-bold sm:text-4xl">{p.title}</h1>
          <span className="[&_span]:text-white/85">
            <Place project={p} />
          </span>
        </div>
      </div>
    </section>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-white/50 px-3 text-xs font-semibold">
      {children}
    </span>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold sm:text-2xl">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground italic">{note}</dd>}
    </div>
  );
}

function KeyFacts({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const r = p.estimatedReturn;
  return (
    <Card>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Fact
            label={t('projects.expectedReturn')}
            value={t('projects.rangePercent', {
              min: fmt.number(shortPercent(r.minPercent)),
              max: fmt.number(shortPercent(r.maxPercent)),
            })}
            note={t('projects.annualized', {
              value: fmt.number(annualized(p), 1),
            })}
          />
          <Fact
            label={t('projects.duration')}
            value={t('projects.months', { count: p.durationMonths })}
          />
          <Fact
            label={t('projects.minInvestment')}
            value={fmt.taka(p.slotPrice)}
          />
          <Fact
            label={t('projects.installments')}
            value={fmt.number(installments(p))}
          />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {t('projects.estimateNote')}
        </p>
      </CardContent>
    </Card>
  );
}

function Funding({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const funded = Number(p.fundedPercent);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('projects.fundingProgress')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Progress value={funded} aria-label={t('projects.fundingProgress')} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Users aria-hidden className="size-4" />
            {t('projects.funded', { percent: fmt.number(funded, 2) })}
            {' · '}
            {t('projects.investors', { count: p.investorCount })}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-warning-strong">
            <Flame aria-hidden className="size-4" />
            {t('projects.unitsLeft', { count: p.availableSlots })}
          </span>
        </div>
        {p.stage === 'open_for_funding' && (
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-sm text-success">
            <span aria-hidden className="size-2 rounded-full bg-success" />
            {t('projects.investingToday', { count: p.investingToday })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Details({ project: p }: { project: ProjectDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const rows: Array<[string, ReactNode]> = [
    [
      t('projects.crop'),
      `${bengali ? (p.produce.nameBn ?? p.produce.name) : p.produce.name} · ${t(`catalog.category.${p.category}`)}`,
    ],
    [t('projects.totalUnits'), fmt.number(p.totalSlots)],
    [t('projects.unitPrice'), fmt.taka(p.slotPrice)],
    [t('projects.target'), fmt.taka(p.fundingTarget)],
    [
      t('projects.payouts'),
      p.payoutIntervalMonths > 0
        ? t('projects.everyMonths', { count: p.payoutIntervalMonths })
        : t('projects.atMaturity'),
    ],
    [t('projects.duration'), t('projects.months', { count: p.durationMonths })],
    [
      t('projects.expectedReturn'),
      t('projects.rangePercent', {
        min: fmt.number(shortPercent(p.estimatedReturn.minPercent)),
        max: fmt.number(shortPercent(p.estimatedReturn.maxPercent)),
      }),
    ],
    [
      t('projects.split'),
      t('projects.splitValue', {
        investors: fmt.number(shortPercent(p.split.investors)),
        farmer: fmt.number(shortPercent(p.split.farmer)),
        wegro: fmt.number(shortPercent(p.split.wegro)),
      }),
    ],
    [t('projects.insurance'), p.insured ? t('catalog.yes') : t('catalog.no')],
    ...(p.plannedStartDate
      ? ([[t('projects.plannedStart'), fmt.date(p.plannedStartDate)]] as Array<
          [string, ReactNode]
        >)
      : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 py-3"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
