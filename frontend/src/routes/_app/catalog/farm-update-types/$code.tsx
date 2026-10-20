import { createFileRoute } from '@tanstack/react-router';
import { FarmUpdateTypePage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/farm-update-types/$code')({
  staticData: { area: 'catalog', page: '/catalog/farm-update-types' },
  component: function CatalogEntryRoute() {
    return <FarmUpdateTypePage code={Route.useParams().code} />;
  },
});
