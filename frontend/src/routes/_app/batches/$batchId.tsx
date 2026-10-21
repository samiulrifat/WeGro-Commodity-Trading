import { createFileRoute } from '@tanstack/react-router';
import { BatchPage } from '@/features/vouchers/batch-page';

export const Route = createFileRoute('/_app/batches/$batchId')({
  staticData: { area: 'batches' },
  component: function Batch() {
    return <BatchPage id={Route.useParams().batchId} base="/batches" />;
  },
});
