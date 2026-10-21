import { createFileRoute } from '@tanstack/react-router';
import { parseVoucherSearch } from '@/features/vouchers/voucher-search';
import { VouchersList } from '@/features/vouchers/vouchers-list';

export const Route = createFileRoute('/_app/vouchers/pending')({
  staticData: { area: 'vouchers', page: '/vouchers/pending' },
  validateSearch: parseVoucherSearch,
  component: function PendingVouchers() {
    return <VouchersList search={Route.useSearch()} pending />;
  },
});
