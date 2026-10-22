import { createFileRoute } from '@tanstack/react-router';
import { ListingsList } from '@/features/marketplace/listings-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';

export const Route = createFileRoute('/_app/marketplace/')({
  staticData: { area: 'marketplace' },
  validateSearch: parseMarketSearch,
  component: function Listings() {
    return <ListingsList search={Route.useSearch()} mode="browse" />;
  },
});
