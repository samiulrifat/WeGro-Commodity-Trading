import { createFileRoute } from '@tanstack/react-router';
import { PeopleList } from '@/features/people/people-list';
import { parsePeopleSearch } from '@/features/people/people-search';

export const Route = createFileRoute('/_app/people/')({
  staticData: { area: 'people' },
  validateSearch: parsePeopleSearch,
  component: function AllPeople() {
    return <PeopleList search={Route.useSearch()} />;
  },
});
