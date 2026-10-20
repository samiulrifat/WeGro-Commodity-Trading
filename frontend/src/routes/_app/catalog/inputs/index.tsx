import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { InputsPage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/inputs/')({
  staticData: { area: 'catalog', page: '/catalog/inputs' },
  validateSearch: parseCatalogSearch,
  component: function CatalogListRoute() {
    return <InputsPage search={Route.useSearch()} />;
  },
});
