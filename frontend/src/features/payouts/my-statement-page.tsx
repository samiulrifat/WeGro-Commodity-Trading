import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettlementMyStatementQuery } from '@/api/generated/settlement';
import { PageHeader } from '@/components/page-header';
import { useAppSelector } from '@/store/hooks';
import { type Period, periodQuery } from './payouts-utils';
import { PeriodPicker, StatementView } from './statement-view';

/**
 * A farmer's or investor's own statement: what they put in, received and
 * are still due, project by project, for any period, with its CSV.
 */
export function MyStatementPage() {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const [period, setPeriod] = useState<Period>({});
  const query = useSettlementMyStatementQuery(period, {
    refetchOnMountOrArgChange: true,
  });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.statement')}
        description={t(
          `payouts.statementIntro.${role === 'farmer' ? 'farmer' : 'investor'}`,
        )}
      />
      <PeriodPicker value={period} onChange={setPeriod} />
      <StatementView
        query={query}
        csvPath={`/api/me/statement.csv${periodQuery(period)}`}
      />
    </div>
  );
}
