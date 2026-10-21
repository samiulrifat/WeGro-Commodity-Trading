import { createFileRoute } from '@tanstack/react-router';
import { SalesList } from '@/features/vouchers/sales-list';
import { parseSaleSearch } from '@/features/vouchers/voucher-search';

export const Route = createFileRoute('/_app/vouchers/sales')({
  staticData: { area: 'vouchers', page: '/vouchers/sales' },
  validateSearch: parseSaleSearch,
  component: function InputSales() {
    return <SalesList search={Route.useSearch()} />;
  },
});
