import { createFileRoute } from '@tanstack/react-router';
import { ClaimPaymentsQueue } from '@/features/insurance/claim-payments-queue';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/insurance/payments')({
  staticData: { area: 'insurance', page: '/insurance/payments' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function InsurerPayments() {
    return <ClaimPaymentsQueue search={Route.useSearch()} />;
  },
});
