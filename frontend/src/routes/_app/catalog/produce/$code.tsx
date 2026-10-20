import { createFileRoute } from '@tanstack/react-router';
import { ProducePage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/produce/$code')({
  staticData: { area: 'catalog', page: '/catalog/produce' },
  component: function CatalogEntryRoute() {
    return <ProducePage code={Route.useParams().code} />;
  },
});
