import { createFileRoute } from '@tanstack/react-router';
import { BatchesList } from '@/features/vouchers/batches-list';
import { parseBatchSearch } from '@/features/vouchers/voucher-search';

export const Route = createFileRoute('/_app/batches/')({
  staticData: { area: 'batches' },
  validateSearch: parseBatchSearch,
  component: function Batches() {
    return <BatchesList search={Route.useSearch()} base="/batches" />;
  },
});
