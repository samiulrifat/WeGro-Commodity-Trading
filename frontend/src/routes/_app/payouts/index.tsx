import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/payouts/')({
  staticData: { area: 'payouts' },
  component: () => <ComingSoon area="payouts" />,
});
