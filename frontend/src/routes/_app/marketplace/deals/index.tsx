import { createFileRoute } from '@tanstack/react-router';
import { DealsList } from '@/features/marketplace/deals-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/marketplace/deals/')({
  staticData: { area: 'marketplace', page: '/marketplace/deals' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function Deals() {
    return <DealsList search={Route.useSearch()} mode="deals" />;
  },
});
