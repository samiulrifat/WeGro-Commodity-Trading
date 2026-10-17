import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/system/')({
  staticData: { area: 'system' },
  component: () => <ComingSoon area="system" />,
});
