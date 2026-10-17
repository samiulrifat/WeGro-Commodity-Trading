import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/farm-updates/')({
  staticData: { area: 'farm-updates' },
  component: () => <ComingSoon area="farm-updates" />,
});
