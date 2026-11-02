import { createFileRoute } from '@tanstack/react-router';
import { parseProjectsSearch } from '@/features/projects/projects-search';
import { ProjectsList } from '@/features/projects/projects-list';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/projects/drafts')({
  staticData: { area: 'projects', page: '/projects/drafts' },
  validateSearch: onlyChecked(parseProjectsSearch),
  component: function Drafts() {
    return <ProjectsList search={Route.useSearch()} drafts />;
  },
});
