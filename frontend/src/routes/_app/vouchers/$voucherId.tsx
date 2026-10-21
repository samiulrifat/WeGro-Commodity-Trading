import { createFileRoute } from '@tanstack/react-router';
import { VoucherPage } from '@/features/vouchers/voucher-page';

export const Route = createFileRoute('/_app/vouchers/$voucherId')({
  staticData: { area: 'vouchers' },
  component: function Voucher() {
    return <VoucherPage id={Route.useParams().voucherId} />;
  },
});
