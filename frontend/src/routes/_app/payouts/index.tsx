import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { RoundsList } from '@/features/payouts/rounds-list';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/payouts/')({
  staticData: { area: 'payouts' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function PayoutRounds() {
    return <RoundsList search={Route.useSearch()} />;
  },
});
