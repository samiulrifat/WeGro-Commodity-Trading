import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/projects/')({
  staticData: { area: 'projects' },
  component: () => <ComingSoon area="projects" />,
});
