import { createFileRoute } from '@tanstack/react-router';
import { InsuredProjectsList } from '@/features/insurance/insured-projects-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/insurance/')({
  staticData: { area: 'insurance' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function InsuredProjects() {
    return <InsuredProjectsList search={Route.useSearch()} />;
  },
});
