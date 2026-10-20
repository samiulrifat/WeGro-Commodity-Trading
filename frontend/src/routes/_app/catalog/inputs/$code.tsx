import { createFileRoute } from '@tanstack/react-router';
import { InputPage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/inputs/$code')({
  staticData: { area: 'catalog', page: '/catalog/inputs' },
  component: function CatalogEntryRoute() {
    return <InputPage code={Route.useParams().code} />;
  },
});
