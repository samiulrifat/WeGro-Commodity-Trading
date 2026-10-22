import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { RequestsList } from '@/features/marketplace/requests-list';

export const Route = createFileRoute('/_app/requests/')({
  staticData: { area: 'requests' },
  validateSearch: parseMarketSearch,
  component: function MyRequests() {
    return <RequestsList search={Route.useSearch()} mine />;
  },
});
