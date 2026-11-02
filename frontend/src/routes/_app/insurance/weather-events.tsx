import { createFileRoute } from '@tanstack/react-router';
import { WeatherEventsList } from '@/features/insurance/weather-events-list';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/insurance/weather-events')({
  staticData: { area: 'insurance', page: '/insurance/weather-events' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function WeatherEvents() {
    return <WeatherEventsList search={Route.useSearch()} />;
  },
});
