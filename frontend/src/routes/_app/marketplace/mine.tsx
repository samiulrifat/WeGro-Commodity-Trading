import { createFileRoute } from '@tanstack/react-router';
import { ListingsList } from '@/features/marketplace/listings-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/marketplace/mine')({
  staticData: { area: 'marketplace', page: '/marketplace/mine' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function MyListings() {
    return <ListingsList search={Route.useSearch()} mode="mine" />;
  },
});
