import { createFileRoute } from '@tanstack/react-router';
import { ProjectFormPage } from '@/features/projects/project-form';

export const Route = createFileRoute('/_app/projects/new')({
  staticData: { area: 'projects', page: '/projects/drafts' },
  component: () => <ProjectFormPage />,
});
