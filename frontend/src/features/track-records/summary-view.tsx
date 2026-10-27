import { useTranslation } from 'react-i18next';
import type {
  ProjectOutcomeDto,
  SummaryImportedProjectDto,
  TrackRecordSummaryDto,
} from '@/api/generated/track-record';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { shortPercent } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { useDistrictName } from '@/features/insurance/use-names';
import { useProduceName } from '@/features/insurance/use-names';

/**
 * A farmer's track record as published: totals across finished projects,
 * then each project's dates, money, harvest and weather risk, then any
 * history imported from before the platform.
 */
export function SummaryView({
  summary: s,
}: {
  summary: TrackRecordSummaryDto;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const tt = s.totals;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('trackRecords.projects')}
          value={fmt.number(tt.projects)}
        />
        <StatCard
          label={t('trackRecords.onTime')}
          value={`${fmt.number(tt.finishedOnTime)} / ${fmt.number(tt.projects)}`}
        />
        <StatCard
          label={t('trackRecords.fundingRaised')}
          value={fmt.taka(tt.fundingRaised)}
        />
        <StatCard
          label={t('trackRecords.farmerReceived')}
          value={fmt.taka(tt.farmerReceived)}
        />
      </div>
      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t('payouts.income')} value={fmt.taka(tt.income)} />
        <Figure label={t('payouts.costsTotal')} value={fmt.taka(tt.costs)} />
        <Figure label={t('payouts.net')} value={fmt.taka(tt.net)} />
        <Figure
          label={t('trackRecords.claims')}
          value={t('trackRecords.claimsValue', {
            count: tt.claimsApproved,
            n: fmt.number(tt.claimsApproved),
            amount: fmt.taka(tt.claimsApprovedAmount),
          })}
        />
      </dl>
      {s.projects.length === 0 ? (
        <p className="text-muted-foreground">{t('trackRecords.noFinished')}</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {s.projects.map((p) => (
            <li key={p.id}>
              <Outcome project={p} />
            </li>
          ))}
        </ul>
      )}
      {s.importedHistory && s.importedHistory.length > 0 && (
        <ImportedHistory projects={s.importedHistory} />
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Outcome({ project: p }: { project: ProjectOutcomeDto }) {
  const produceName = useProduceName();
  const districtName = useDistrictName();
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{p.title}</CardTitle>
        <CardDescription>
          {produceName(p.produce.code)} · {districtName(p.district)} ·{' '}
          {p.startedOn ? fmt.date(p.startedOn) : '—'} –{' '}
          {p.finishedOn ? fmt.date(p.finishedOn) : '—'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <span className="flex flex-wrap gap-1.5">
          {p.onTime !== null && (
            <StatusPill
              tone={p.onTime ? 'success' : 'warning'}
              appearance="soft"
            >
              {p.onTime
                ? t('trackRecords.finishedOnTime')
                : t('trackRecords.late')}
            </StatusPill>
          )}
          {p.risk.events.length > 0 && (
            <StatusPill tone="warning" appearance="soft">
              {t('trackRecords.weatherEvents', { count: p.risk.events.length })}
            </StatusPill>
          )}
        </span>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Figure
            label={t('trackRecords.fundingRaised')}
            value={fmt.taka(p.money.fundingRaised)}
          />
          <Figure
            label={t('payouts.income')}
            value={fmt.taka(p.money.income)}
          />
          <Figure
            label={t('payouts.costsTotal')}
            value={fmt.taka(p.money.costs)}
          />
          <Figure label={t('payouts.net')} value={fmt.taka(p.money.net)} />
          <Figure
            label={t('trackRecords.farmerReceived')}
            value={fmt.taka(p.money.farmerReceived)}
          />
          {p.money.investorReturnPercent !== null && (
            <Figure
              label={t('trackRecords.investorReturn')}
              value={`${fmt.number(shortPercent(p.money.investorReturnPercent))}%`}
            />
          )}
          <Figure
            label={t('trackRecords.harvest')}
            value={
              p.harvest.harvested
                ? t('trackRecords.harvestValue', {
                    harvested: fmt.number(p.harvest.harvested),
                    sold: fmt.number(p.harvest.sold),
                    unit: p.harvest.unit,
                  })
                : t('trackRecords.soldValue', {
                    sold: fmt.number(p.harvest.sold),
                    unit: p.harvest.unit,
                  })
            }
          />
          {p.risk.claimsApproved + p.risk.claimsRejected > 0 && (
            <Figure
              label={t('trackRecords.claims')}
              value={t('trackRecords.claimsValue', {
                count: p.risk.claimsApproved,
                n: fmt.number(p.risk.claimsApproved),
                amount: fmt.taka(p.risk.approvedAmount),
              })}
            />
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Projects finished before the platform, imported from WeGro's records; not on the ledger. */
export function ImportedHistory({
  projects,
}: {
  projects: ReadonlyArray<
    Pick<
      SummaryImportedProjectDto,
      | 'title'
      | 'produce'
      | 'district'
      | 'startedOn'
      | 'finishedOn'
      | 'net'
      | 'farmerReceived'
    >
  >;
}) {
  const produceName = useProduceName();
  const districtName = useDistrictName();
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('trackRecords.imported')}</CardTitle>
        <CardDescription>{t('trackRecords.importedText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {projects.map((p, i) => (
            <li
              key={`${p.title}-${i}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="grid gap-0.5">
                <span className="font-medium">{p.title}</span>
                <span className="text-sm text-muted-foreground">
                  {produceName(p.produce.code)} · {districtName(p.district)} ·{' '}
                  {fmt.date(p.startedOn)} – {fmt.date(p.finishedOn)}
                </span>
              </span>
              <span className="text-sm">
                {t('payouts.net')}:{' '}
                <span className="font-semibold">{fmt.taka(p.net)}</span>
                {' · '}
                {t('trackRecords.farmerReceived')}:{' '}
                <span className="font-semibold">
                  {fmt.taka(p.farmerReceived)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
