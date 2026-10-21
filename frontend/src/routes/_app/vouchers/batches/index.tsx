import { createFileRoute } from '@tanstack/react-router';
import { BatchesList } from '@/features/vouchers/batches-list';
import { parseBatchSearch } from '@/features/vouchers/voucher-search';

export const Route = createFileRoute('/_app/vouchers/batches/')({
  staticData: { area: 'vouchers', page: '/vouchers/batches' },
  validateSearch: parseBatchSearch,
  component: function InputBatches() {
    return <BatchesList search={Route.useSearch()} base="/vouchers/batches" />;
  },
});
