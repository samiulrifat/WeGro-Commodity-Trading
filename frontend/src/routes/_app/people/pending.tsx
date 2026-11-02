import { createFileRoute } from '@tanstack/react-router';
import { PeopleList } from '@/features/people/people-list';
import { parsePeopleSearch } from '@/features/people/people-search';
import { onlyChecked } from '@/lib/search';

/** Registrations an admin (or for staff the super admin) still has to verify. */
export const Route = createFileRoute('/_app/people/pending')({
  staticData: { area: 'people', page: '/people/pending' },
  validateSearch: onlyChecked(parsePeopleSearch),
  component: function PendingPeople() {
    return <PeopleList pending search={Route.useSearch()} />;
  },
});
