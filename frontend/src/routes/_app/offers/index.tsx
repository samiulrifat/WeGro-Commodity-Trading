import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/offers/')({
  staticData: { area: 'offers' },
  component: () => <ComingSoon area="offers" />,
});
