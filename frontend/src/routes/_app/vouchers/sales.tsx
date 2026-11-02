import { createFileRoute } from '@tanstack/react-router';
import { SalesList } from '@/features/vouchers/sales-list';
import { parseSaleSearch } from '@/features/vouchers/voucher-search';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/vouchers/sales')({
  staticData: { area: 'vouchers', page: '/vouchers/sales' },
  validateSearch: onlyChecked(parseSaleSearch),
  component: function InputSales() {
    return <SalesList search={Route.useSearch()} />;
  },
});
