import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { RoundsList } from '@/features/payouts/rounds-list';

export const Route = createFileRoute('/_app/payouts/')({
  staticData: { area: 'payouts' },
  validateSearch: parseMarketSearch,
  component: function PayoutRounds() {
    return <RoundsList search={Route.useSearch()} />;
  },
});
