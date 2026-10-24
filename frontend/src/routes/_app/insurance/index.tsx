import { createFileRoute } from '@tanstack/react-router';
import { InsuredProjectsList } from '@/features/insurance/insured-projects-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';

export const Route = createFileRoute('/_app/insurance/')({
  staticData: { area: 'insurance' },
  validateSearch: parseMarketSearch,
  component: function InsuredProjects() {
    return <InsuredProjectsList search={Route.useSearch()} />;
  },
});
