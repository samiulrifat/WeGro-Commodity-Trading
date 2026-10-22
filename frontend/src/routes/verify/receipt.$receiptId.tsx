import { createFileRoute } from '@tanstack/react-router';
import { VerifyReceiptPage } from '@/features/warehouse/verify-receipt-page';

/** Public: opened by the QR on a printed receipt; no sign-in. */
export const Route = createFileRoute('/verify/receipt/$receiptId')({
  component: function VerifyReceipt() {
    return <VerifyReceiptPage id={Route.useParams().receiptId} />;
  },
});
