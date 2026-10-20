import { createFileRoute } from '@tanstack/react-router';
import { UnitPage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/units/$code')({
  staticData: { area: 'catalog', page: '/catalog/units' },
  component: function CatalogEntryRoute() {
    return <UnitPage code={Route.useParams().code} />;
  },
});
