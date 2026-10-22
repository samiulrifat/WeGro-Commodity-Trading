import { createFileRoute } from '@tanstack/react-router';
import { parseSiteSearch } from '@/features/warehouse/receipt-utils';
import { SitesPage } from '@/features/warehouse/sites-page';

export const Route = createFileRoute('/_app/warehouse/sites')({
  staticData: { area: 'warehouse', page: '/warehouse/sites' },
  validateSearch: parseSiteSearch,
  component: function Sites() {
    return <SitesPage search={Route.useSearch()} />;
  },
});
