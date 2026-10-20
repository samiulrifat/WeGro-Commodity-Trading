import { createFileRoute } from '@tanstack/react-router';
import { WeatherEventPage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/weather-events/$code')({
  staticData: { area: 'catalog', page: '/catalog/weather-events' },
  component: function CatalogEntryRoute() {
    return <WeatherEventPage code={Route.useParams().code} />;
  },
});
