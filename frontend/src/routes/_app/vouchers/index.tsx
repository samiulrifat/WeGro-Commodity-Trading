import { createFileRoute } from '@tanstack/react-router';
import { parseVoucherSearch } from '@/features/vouchers/voucher-search';
import { VouchersList } from '@/features/vouchers/vouchers-list';

export const Route = createFileRoute('/_app/vouchers/')({
  staticData: { area: 'vouchers' },
  validateSearch: parseVoucherSearch,
  component: function Vouchers() {
    return <VouchersList search={Route.useSearch()} />;
  },
});
