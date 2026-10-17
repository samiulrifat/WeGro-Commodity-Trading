import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/marketplace/')({
  staticData: { area: 'marketplace' },
  component: () => <ComingSoon area="marketplace" />,
});
