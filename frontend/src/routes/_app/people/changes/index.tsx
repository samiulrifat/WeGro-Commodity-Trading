import { createFileRoute } from '@tanstack/react-router';
import type { DetailChangeStatus } from '@/api/generated/participants';
import {
  type ChangesSearch,
  DetailChangesList,
} from '@/features/people/detail-changes';

const SHOWN = new Set<string>(['pending', 'approved', 'rejected']);

export const Route = createFileRoute('/_app/people/changes/')({
  staticData: { area: 'people', page: '/people/changes' },
  validateSearch: (search): ChangesSearch => {
    const out: ChangesSearch = {};
    if (typeof search.status === 'string' && SHOWN.has(search.status)) {
      out.status = search.status as DetailChangeStatus;
    }
    if (typeof search.q === 'string' && search.q.trim().length <= 100) {
      out.q = search.q.trim() || undefined;
    }
    const page = Number(search.page);
    if (Number.isInteger(page) && page > 1) out.page = page;
    return out;
  },
  component: function DetailChanges() {
    return <DetailChangesList search={Route.useSearch()} />;
  },
});
