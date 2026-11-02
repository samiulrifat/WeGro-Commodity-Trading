import { createFileRoute } from '@tanstack/react-router';
import { parseUpdateListSearch } from '@/features/farm-updates/search';
import { SentPage } from '@/features/farm-updates/sent-page';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/farm-updates/sent')({
  staticData: { area: 'farm-updates', page: '/farm-updates/sent' },
  validateSearch: onlyChecked(parseUpdateListSearch),
  component: function SentUpdates() {
    return <SentPage search={Route.useSearch()} />;
  },
});
