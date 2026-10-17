import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/holdings/')({
  staticData: { area: 'holdings' },
  component: () => <ComingSoon area="holdings" />,
});
