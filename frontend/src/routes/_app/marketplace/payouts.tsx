import { createFileRoute } from '@tanstack/react-router';
import { DealsList } from '@/features/marketplace/deals-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';

export const Route = createFileRoute('/_app/marketplace/payouts')({
  staticData: { area: 'marketplace', page: '/marketplace/payouts' },
  validateSearch: parseMarketSearch,
  component: function SellerPayouts() {
    return <DealsList search={Route.useSearch()} mode="payouts" />;
  },
});
