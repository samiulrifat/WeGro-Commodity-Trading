import { createFileRoute } from '@tanstack/react-router';
import { ActivityPage } from '@/features/audit/activity-page';
import { parseActivitySearch } from '@/features/audit/search';

export const Route = createFileRoute('/_app/audit/')({
  staticData: { area: 'audit', page: '/audit' },
  validateSearch: parseActivitySearch,
  component: function Activity() {
    return <ActivityPage search={Route.useSearch()} />;
  },
});
