import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { SettleProjectsList } from '@/features/payouts/settle-projects-list';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/payouts/projects/')({
  staticData: { area: 'payouts', page: '/payouts/projects' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function SettleProjects() {
    return <SettleProjectsList search={Route.useSearch()} />;
  },
});
