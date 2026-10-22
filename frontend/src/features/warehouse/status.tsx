import { useTranslation } from 'react-i18next';
import type { ReceiptDto } from '@/api/generated/warehouse';
import { StatusPill } from '@/components/status-pill';
import { expiringSoon } from './receipt-utils';

const TONE = {
  submitted: 'neutral',
  issued: 'success',
  pending_handover: 'warning',
  listed: 'neutral',
  sold: 'neutral',
  collected: 'neutral',
  sold_out: 'neutral',
} as const;

/** Where a receipt stands, flagged when it has expired or soon will. */
export function ReceiptStatus({
  receipt: r,
}: {
  receipt: Pick<ReceiptDto, 'status' | 'expiresOn' | 'expired'>;
}) {
  const { t } = useTranslation();
  const held = !['collected', 'sold_out', 'submitted'].includes(r.status);
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusPill tone={TONE[r.status]} appearance="soft">
        {t(`warehouse.status.${r.status}`)}
      </StatusPill>
      {held && r.expired && (
        <StatusPill tone="danger" appearance="soft">
          {t('warehouse.expired')}
        </StatusPill>
      )}
      {expiringSoon(r) && (
        <StatusPill tone="warning" appearance="soft">
          {t('warehouse.expiringSoon')}
        </StatusPill>
      )}
    </span>
  );
}
