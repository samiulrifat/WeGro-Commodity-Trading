import { createFileRoute } from '@tanstack/react-router';
import { DealsList } from '@/features/marketplace/deals-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/offers/')({
  staticData: { area: 'offers' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function MyOffers() {
    return <DealsList search={Route.useSearch()} mode="mine" />;
  },
});
