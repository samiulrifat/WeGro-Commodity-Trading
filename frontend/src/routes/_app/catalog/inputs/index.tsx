import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { InputsPage } from '@/features/catalog/pages';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/catalog/inputs/')({
  staticData: { area: 'catalog', page: '/catalog/inputs' },
  validateSearch: onlyChecked(parseCatalogSearch),
  component: function CatalogListRoute() {
    return <InputsPage search={Route.useSearch()} />;
  },
});
