import { createFileRoute } from '@tanstack/react-router';
import { parseProjectsSearch } from '@/features/projects/projects-search';
import { ProjectsList } from '@/features/projects/projects-list';

export const Route = createFileRoute('/_app/projects/')({
  staticData: { area: 'projects' },
  validateSearch: parseProjectsSearch,
  component: function Projects() {
    return <ProjectsList search={Route.useSearch()} />;
  },
});
