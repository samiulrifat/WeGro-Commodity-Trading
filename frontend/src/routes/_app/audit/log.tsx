import { createFileRoute } from '@tanstack/react-router';
import { LogPage } from '@/features/audit/log-page';
import { parseLogSearch } from '@/features/audit/search';

export const Route = createFileRoute('/_app/audit/log')({
  staticData: { area: 'audit', page: '/audit/log' },
  validateSearch: parseLogSearch,
  component: function Log() {
    return <LogPage search={Route.useSearch()} />;
  },
});
