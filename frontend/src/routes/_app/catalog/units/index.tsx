import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { UnitsPage } from '@/features/catalog/pages';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/catalog/units/')({
  staticData: { area: 'catalog', page: '/catalog/units' },
  validateSearch: onlyChecked(parseCatalogSearch),
  component: function CatalogListRoute() {
    return <UnitsPage search={Route.useSearch()} />;
  },
});
