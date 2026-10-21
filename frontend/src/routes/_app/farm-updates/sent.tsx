import { createFileRoute } from '@tanstack/react-router';
import { parseUpdateListSearch } from '@/features/farm-updates/search';
import { SentPage } from '@/features/farm-updates/sent-page';

export const Route = createFileRoute('/_app/farm-updates/sent')({
  staticData: { area: 'farm-updates', page: '/farm-updates/sent' },
  validateSearch: parseUpdateListSearch,
  component: function SentUpdates() {
    return <SentPage search={Route.useSearch()} />;
  },
});
