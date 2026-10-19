import { createFileRoute } from '@tanstack/react-router';
import type { DetailChangeStatus } from '@/api/generated/participants';
import { DetailChangesList } from '@/features/people/detail-changes';

const SHOWN = new Set<string>(['pending', 'approved', 'rejected']);

export const Route = createFileRoute('/_app/people/changes/')({
  staticData: { area: 'people', page: '/people/changes' },
  validateSearch: (search): { status?: DetailChangeStatus } =>
    typeof search.status === 'string' && SHOWN.has(search.status)
      ? { status: search.status as DetailChangeStatus }
      : {},
  component: function DetailChanges() {
    const { status } = Route.useSearch();
    return <DetailChangesList status={status ?? 'pending'} />;
  },
});
