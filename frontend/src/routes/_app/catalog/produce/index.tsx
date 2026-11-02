import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { ProduceListPage } from '@/features/catalog/pages';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/catalog/produce/')({
  staticData: { area: 'catalog', page: '/catalog/produce' },
  validateSearch: onlyChecked(parseCatalogSearch),
  component: function CatalogListRoute() {
    return <ProduceListPage search={Route.useSearch()} />;
  },
});
