import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { CostsList } from '@/features/payouts/costs-list';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/payouts/costs')({
  staticData: { area: 'payouts', page: '/payouts/costs' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function Costs() {
    return <CostsList search={Route.useSearch()} />;
  },
});
