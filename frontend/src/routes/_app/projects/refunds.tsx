import { createFileRoute } from '@tanstack/react-router';
import { parseRefundsSearch } from '@/features/projects/projects-search';
import { RefundsPage } from '@/features/projects/refunds-page';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/projects/refunds')({
  staticData: { area: 'projects', page: '/projects/refunds' },
  validateSearch: onlyChecked(parseRefundsSearch),
  component: function Refunds() {
    return <RefundsPage search={Route.useSearch()} />;
  },
});
