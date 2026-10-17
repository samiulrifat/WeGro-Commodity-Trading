import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/dashboard/')({
  staticData: { area: 'dashboard' },
  component: () => <ComingSoon area="dashboard" />,
});
