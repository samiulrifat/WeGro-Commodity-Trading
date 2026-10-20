import { useTranslation } from 'react-i18next';
import type { ParticipantSummaryDto } from '@/api/generated/participants';
import { StatusPill } from '@/components/status-pill';

const TONE = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
} as const;

/**
 * Where someone stands: pending, verified, rejected or with access revoked,
 * and what else needs a look (flagged by the ID check, or not yet confirmed
 * by the ledger).
 */
export function PersonStatus({
  person,
}: {
  person: Pick<
    ParticipantSummaryDto,
    'status' | 'chainState' | 'idCheckOutcome' | 'accessRevoked'
  >;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusPill tone={TONE[person.status]} appearance="soft">
        {person.accessRevoked
          ? t('people.accessRevoked')
          : t(`people.status.${person.status}`)}
      </StatusPill>
      {person.status === 'pending' && person.idCheckOutcome === 'flagged' && (
        <StatusPill tone="warning" appearance="soft">
          {t('people.flagged')}
        </StatusPill>
      )}
      {person.chainState === 'submitted' && (
        <StatusPill tone="neutral" appearance="soft">
          {t('people.ledgerPending')}
        </StatusPill>
      )}
    </span>
  );
}
