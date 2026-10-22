import { createFileRoute } from '@tanstack/react-router';
import { DealsList } from '@/features/marketplace/deals-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';

export const Route = createFileRoute('/_app/offers/')({
  staticData: { area: 'offers' },
  validateSearch: parseMarketSearch,
  component: function MyOffers() {
    return <DealsList search={Route.useSearch()} mode="mine" />;
  },
});
