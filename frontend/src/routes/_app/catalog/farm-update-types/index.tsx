import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { FarmUpdateTypesPage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/farm-update-types/')({
  staticData: { area: 'catalog', page: '/catalog/farm-update-types' },
  validateSearch: parseCatalogSearch,
  component: function CatalogListRoute() {
    return <FarmUpdateTypesPage search={Route.useSearch()} />;
  },
});
