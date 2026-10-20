import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { WeatherEventsPage } from '@/features/catalog/pages';

export const Route = createFileRoute('/_app/catalog/weather-events/')({
  staticData: { area: 'catalog', page: '/catalog/weather-events' },
  validateSearch: parseCatalogSearch,
  component: function CatalogListRoute() {
    return <WeatherEventsPage search={Route.useSearch()} />;
  },
});
