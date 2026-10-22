import { createFileRoute } from '@tanstack/react-router';
import { parseReceiptSearch } from '@/features/warehouse/receipt-utils';
import { ReceiptsList } from '@/features/warehouse/receipts-list';

export const Route = createFileRoute('/_app/warehouse/')({
  staticData: { area: 'warehouse' },
  validateSearch: parseReceiptSearch,
  component: function Receipts() {
    return <ReceiptsList search={Route.useSearch()} />;
  },
});
