import { createFileRoute } from '@tanstack/react-router';
import { parseCatalogSearch } from '@/features/catalog/catalog';
import { WeatherEventsPage } from '@/features/catalog/pages';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/catalog/weather-events/')({
  staticData: { area: 'catalog', page: '/catalog/weather-events' },
  validateSearch: onlyChecked(parseCatalogSearch),
  component: function CatalogListRoute() {
    return <WeatherEventsPage search={Route.useSearch()} />;
  },
});
