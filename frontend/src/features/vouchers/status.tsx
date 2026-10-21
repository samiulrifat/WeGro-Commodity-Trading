import { useTranslation } from 'react-i18next';
import type { VoucherDto, VoucherSaleDto } from '@/api/generated/vouchers';
import { StatusPill } from '@/components/status-pill';

const VOUCHER_TONE = {
  submitted: 'neutral',
  proposed: 'warning',
  active: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
} as const;

const SALE_TONE = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
} as const;

/** Where a voucher stands; flagged when it has been idle past its limit. */
export function VoucherStatus({
  voucher,
}: {
  voucher: Pick<VoucherDto, 'status' | 'inactiveSince'>;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusPill tone={VOUCHER_TONE[voucher.status]} appearance="soft">
        {t(`vouchers.status.${voucher.status}`)}
      </StatusPill>
      {voucher.inactiveSince && (
        <StatusPill tone="danger" appearance="soft">
          {t('vouchers.inactive')}
        </StatusPill>
      )}
    </span>
  );
}

export function SaleStatus({ status }: { status: VoucherSaleDto['status'] }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={SALE_TONE[status]} appearance="soft">
      {t(`vouchers.saleStatus.${status}`)}
    </StatusPill>
  );
}
