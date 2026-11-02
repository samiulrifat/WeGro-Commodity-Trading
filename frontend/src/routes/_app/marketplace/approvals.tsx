import { createFileRoute } from '@tanstack/react-router';
import { ListingsList } from '@/features/marketplace/listings-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/marketplace/approvals')({
  staticData: { area: 'marketplace', page: '/marketplace/approvals' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function ListingApprovals() {
    return <ListingsList search={Route.useSearch()} mode="approvals" />;
  },
});
