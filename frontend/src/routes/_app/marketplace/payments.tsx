import { createFileRoute } from '@tanstack/react-router';
import { DealPaymentsQueue } from '@/features/marketplace/deal-payments-queue';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/marketplace/payments')({
  staticData: { area: 'marketplace', page: '/marketplace/payments' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function DealPayments() {
    return <DealPaymentsQueue search={Route.useSearch()} />;
  },
});
