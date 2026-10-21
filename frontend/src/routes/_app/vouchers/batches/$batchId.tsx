import { createFileRoute } from '@tanstack/react-router';
import { BatchPage } from '@/features/vouchers/batch-page';

export const Route = createFileRoute('/_app/vouchers/batches/$batchId')({
  staticData: { area: 'vouchers', page: '/vouchers/batches' },
  component: function InputBatch() {
    return (
      <BatchPage id={Route.useParams().batchId} base="/vouchers/batches" />
    );
  },
});
