import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { BanksPage } from '@/features/track-records/banks-page';

export const Route = createFileRoute('/_app/track-records/banks')({
  staticData: { area: 'track-records', page: '/track-records/banks' },
  validateSearch: parseMarketSearch,
  component: function Banks() {
    return <BanksPage search={Route.useSearch()} />;
  },
});
