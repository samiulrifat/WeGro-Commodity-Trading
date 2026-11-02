import { createFileRoute } from '@tanstack/react-router';
import { parseReceiptSearch } from '@/features/warehouse/receipt-utils';
import { ReceiptsList } from '@/features/warehouse/receipts-list';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/warehouse/handovers')({
  staticData: { area: 'warehouse', page: '/warehouse/handovers' },
  validateSearch: onlyChecked(parseReceiptSearch),
  component: function Handovers() {
    return <ReceiptsList search={Route.useSearch()} handovers />;
  },
});
