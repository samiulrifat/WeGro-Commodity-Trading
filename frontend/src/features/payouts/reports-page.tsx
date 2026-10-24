import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { skipToken } from '@reduxjs/toolkit/query';
import { useSettlementStatementQuery } from '@/api/generated/settlement';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { OfficerPicker } from '@/features/people/officer-picker';
import { cn } from '@/lib/utils';
import { DownloadButton } from './download-button';
import { type Period, periodQuery } from './payouts-utils';
import { PeriodPicker, StatementView } from './statement-view';

/**
 * Reports for the books: the rounds approved in a period, and any farmer's
 * or investor's statement, each with its CSV.
 */
export function ReportsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.reports')}
        description={t('payouts.reportsIntro')}
      />
      <PeriodReport />
      <PayeeStatement />
    </div>
  );
}

function PeriodReport() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>({});
  const ready = !!period.from && !!period.to && period.from <= period.to;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payouts.periodReport')}</CardTitle>
        <CardDescription>{t('payouts.periodReportText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PeriodPicker value={period} onChange={setPeriod} />
        {ready ? (
          <DownloadButton
            className="w-fit"
            path={`/api/settlement/reports/period.csv${periodQuery(period)}`}
          >
            {t('payouts.downloadPeriod')}
          </DownloadButton>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('payouts.choosePeriod')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PayeeStatement() {
  const { t } = useTranslation();
  const [role, setRole] = useState<'investor' | 'farmer'>('investor');
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>({});
  const query = useSettlementStatementQuery(
    payeeId ? { payeeId, ...period } : skipToken,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payouts.payeeStatement')}</CardTitle>
        <CardDescription>{t('payouts.payeeStatementText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <fieldset className="flex gap-2">
          <legend className="sr-only">{t('payouts.payeeKind')}</legend>
          {(['investor', 'farmer'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => {
                setRole(r);
                setPayeeId(null);
              }}
              className={cn(
                'min-h-11 rounded-full border px-5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                role === r
                  ? 'border-ink bg-ink text-white'
                  : 'bg-card hover:bg-muted',
              )}
            >
              {t(`roles.${r}`)}
            </button>
          ))}
        </fieldset>
        <OfficerPicker
          open
          personRole={role}
          exclude={[]}
          value={payeeId}
          onChange={setPayeeId}
          placeholder={t('payouts.findPayee')}
        />
        {payeeId && (
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <StatementView
              query={query}
              csvPath={`/api/settlement/statements/${payeeId}/statement.csv${periodQuery(period)}`}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
