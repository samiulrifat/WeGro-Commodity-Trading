import { createFileRoute, notFound } from '@tanstack/react-router';
import { isHistoryType } from '@/features/audit/audit-utils';
import { HistoryPage } from '@/features/audit/history-page';
import { parseHistorySearch } from '@/features/audit/search';

export const Route = createFileRoute('/_app/audit/history/$type/$id')({
  staticData: { area: 'audit', page: '/audit' },
  validateSearch: parseHistorySearch,
  beforeLoad: ({ params }) => {
    if (!isHistoryType(params.type)) throw notFound();
  },
  component: function RecordHistory() {
    const { type, id } = Route.useParams();
    return (
      <HistoryPage
        type={isHistoryType(type) ? type : 'project'}
        id={id}
        search={Route.useSearch()}
      />
    );
  },
});
