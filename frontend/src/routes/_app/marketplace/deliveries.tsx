import { createFileRoute } from '@tanstack/react-router';
import { DealsList } from '@/features/marketplace/deals-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';

export const Route = createFileRoute('/_app/marketplace/deliveries')({
  staticData: { area: 'marketplace', page: '/marketplace/deliveries' },
  validateSearch: parseMarketSearch,
  component: function Deliveries() {
    return <DealsList search={Route.useSearch()} mode="deliveries" />;
  },
});
