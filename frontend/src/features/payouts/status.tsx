import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/status-pill';
import type { RoundStatus } from './payouts-utils';

const ROUND_TONE = {
  prepared: 'warning',
  approved: 'warning',
  paid: 'success',
  rejected: 'danger',
} as const;

/** Where a payout round stands: waiting for a second approval, to pay, paid or sent back. */
export function RoundStatusPill({ status }: { status: RoundStatus }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={ROUND_TONE[status]} appearance="soft">
      {t(`payouts.roundStatus.${status}`)}
    </StatusPill>
  );
}

/** A staged (part-way) or final round. */
export function RoundKindPill({ isFinal }: { isFinal: boolean }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone="neutral" appearance="soft">
      {isFinal ? t('payouts.final') : t('payouts.staged')}
    </StatusPill>
  );
}
