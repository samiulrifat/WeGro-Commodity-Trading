import { createFileRoute } from '@tanstack/react-router';
import { ReceiptPage } from '@/features/warehouse/receipt-page';

export const Route = createFileRoute('/_app/warehouse/receipts/$receiptId')({
  staticData: { area: 'warehouse' },
  component: function Receipt() {
    return <ReceiptPage id={Route.useParams().receiptId} />;
  },
});
