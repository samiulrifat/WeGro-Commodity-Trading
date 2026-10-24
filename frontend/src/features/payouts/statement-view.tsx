import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import type { StatementDto } from '@/api/generated/settlement';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/stat-card';
import { useFormat } from '@/i18n/use-format';
import { DownloadButton } from './download-button';
import type { Period } from './payouts-utils';

/** The days a statement covers, both optional. */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="period-from">{t('payouts.from')}</FieldLabel>
        <Input
          id="period-from"
          type="date"
          value={value.from ?? ''}
          max={value.to}
          onChange={(e) =>
            onChange({ ...value, from: e.target.value || undefined })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="period-to">{t('payouts.to')}</FieldLabel>
        <Input
          id="period-to"
          type="date"
          value={value.to ?? ''}
          min={value.from}
          onChange={(e) =>
            onChange({ ...value, to: e.target.value || undefined })
          }
        />
      </Field>
    </div>
  );
}

/**
 * A payee's statement: what they put in, received, are still due and had
 * refunded, project by project with each payout, and each line checked
 * against the ledger. With its CSV.
 */
export function StatementView({
  query,
  csvPath,
}: {
  query: {
    data?: { data: StatementDto };
    error?: unknown;
    isLoading: boolean;
    refetch: () => unknown;
  };
  csvPath: string;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) {
    return (
      <ErrorState
        error={toApiError(query.error as never)!}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const s = query.data.data;
  const investor = s.projects.some((p) => p.role === 'investor');
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {investor && (
          <StatCard
            label={t('payouts.invested')}
            value={fmt.taka(s.totals.invested)}
          />
        )}
        <StatCard
          label={t('payouts.received')}
          value={fmt.taka(s.totals.received)}
        />
        <StatCard label={t('payouts.due')} value={fmt.taka(s.totals.due)} />
        {investor && (
          <StatCard
            label={t('payouts.refunded')}
            value={fmt.taka(s.totals.refunded)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('payouts.statementNote')}
        </p>
        <DownloadButton path={csvPath}>
          {t('payouts.statementCsv')}
        </DownloadButton>
      </div>
      {s.projects.length === 0 ? (
        <EmptyState icon={FileText} title={t('payouts.noStatement')} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {s.projects.map((p) => (
            <li key={`${p.project.id}-${p.role}`}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{p.project.name}</CardTitle>
                  <CardDescription>
                    {t(`roles.${p.role}`)}
                    {p.slots != null && (
                      <> · {t('payouts.slots', { count: p.slots })}</>
                    )}
                    {p.invested && (
                      <>
                        {' '}
                        ·{' '}
                        {t('payouts.investedAmount', {
                          amount: fmt.taka(p.invested),
                        })}
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">
                        {t('payouts.received')}
                      </dt>
                      <dd className="font-semibold">{fmt.taka(p.received)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('payouts.due')}
                      </dt>
                      <dd className="font-semibold">{fmt.taka(p.due)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('payouts.refunded')}
                      </dt>
                      <dd className="font-semibold">{fmt.taka(p.refunded)}</dd>
                    </div>
                  </dl>
                  {p.payouts.length > 0 && (
                    <ul className="divide-y border-t">
                      {p.payouts.map((o) => (
                        <li
                          key={o.roundId}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                        >
                          <span>
                            {o.isFinal
                              ? t('payouts.final')
                              : t('payouts.staged')}{' '}
                            · {fmt.date(o.approvedAt)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold">
                              {fmt.taka(o.amount)}
                            </span>
                            <StatusPill
                              tone={o.paid ? 'success' : 'warning'}
                              appearance="soft"
                            >
                              {o.paid
                                ? t('payouts.paidOn', {
                                    date: fmt.date(o.paidAt ?? o.approvedAt),
                                  })
                                : t('payouts.lineUnpaid')}
                            </StatusPill>
                            {!o.verified && (
                              <StatusPill tone="danger" appearance="soft">
                                {t('payouts.notVerified')}
                              </StatusPill>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
