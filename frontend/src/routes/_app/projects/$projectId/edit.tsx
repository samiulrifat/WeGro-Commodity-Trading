import { createFileRoute } from '@tanstack/react-router';
import { ProjectFormPage } from '@/features/projects/project-form';

export const Route = createFileRoute('/_app/projects/$projectId/edit')({
  staticData: { area: 'projects', page: '/projects/drafts' },
  component: function EditProject() {
    return <ProjectFormPage id={Route.useParams().projectId} />;
  },
});
