import { createFileRoute } from '@tanstack/react-router';
import { VerifyBatchPage } from '@/features/vouchers/verify-batch-page';

/** Public: opened by the QR on a bag; no sign-in. */
export const Route = createFileRoute('/verify/batch/$batchId')({
  component: function VerifyBatch() {
    return <VerifyBatchPage id={Route.useParams().batchId} />;
  },
});
