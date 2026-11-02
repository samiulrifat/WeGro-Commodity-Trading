import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { BankFarmersList } from '@/features/track-records/bank-farmers-list';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/bank/farmers/')({
  staticData: { area: 'bank-farmers' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function BankFarmers() {
    return <BankFarmersList search={Route.useSearch()} />;
  },
});
