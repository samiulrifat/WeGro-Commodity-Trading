import { createFileRoute } from '@tanstack/react-router';
import { ClaimsList } from '@/features/insurance/claims-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';

export const Route = createFileRoute('/_app/insurance/claims/')({
  staticData: { area: 'insurance', page: '/insurance/claims' },
  validateSearch: parseMarketSearch,
  component: function Claims() {
    return <ClaimsList search={Route.useSearch()} />;
  },
});
