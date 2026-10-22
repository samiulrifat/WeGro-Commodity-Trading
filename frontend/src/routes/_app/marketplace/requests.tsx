import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { RequestsList } from '@/features/marketplace/requests-list';

export const Route = createFileRoute('/_app/marketplace/requests')({
  staticData: { area: 'marketplace', page: '/marketplace/requests' },
  validateSearch: parseMarketSearch,
  component: function BuyerRequests() {
    return <RequestsList search={Route.useSearch()} />;
  },
});
