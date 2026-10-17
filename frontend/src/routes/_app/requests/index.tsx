import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/requests/')({
  staticData: { area: 'requests' },
  component: () => <ComingSoon area="requests" />,
});
