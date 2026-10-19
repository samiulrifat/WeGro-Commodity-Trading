import { createFileRoute } from '@tanstack/react-router';
import { DetailChangeReview } from '@/features/people/detail-changes';

export const Route = createFileRoute('/_app/people/changes/$changeId')({
  staticData: { area: 'people', page: '/people/changes' },
  component: function DetailChange() {
    const { changeId } = Route.useParams();
    return <DetailChangeReview key={changeId} id={changeId} />;
  },
});
