import { createFileRoute } from '@tanstack/react-router';
import { PersonPage } from '@/features/people/person-page';

export const Route = createFileRoute('/_app/people/$personId')({
  staticData: { area: 'people' },
  component: function Person() {
    const { personId } = Route.useParams();
    return <PersonPage key={personId} id={personId} />;
  },
});
