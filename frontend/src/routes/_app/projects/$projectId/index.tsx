import { createFileRoute } from '@tanstack/react-router';
import { ProjectPage } from '@/features/projects/project-page';

export const Route = createFileRoute('/_app/projects/$projectId/')({
  staticData: { area: 'projects' },
  component: function Project() {
    return <ProjectPage id={Route.useParams().projectId} />;
  },
});
