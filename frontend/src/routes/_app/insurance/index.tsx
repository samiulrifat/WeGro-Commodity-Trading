import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/insurance/')({
  staticData: { area: 'insurance' },
  component: () => <ComingSoon area="insurance" />,
});
