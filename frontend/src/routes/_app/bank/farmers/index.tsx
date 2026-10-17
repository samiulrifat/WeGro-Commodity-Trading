import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/bank/farmers/')({
  staticData: { area: 'bank-farmers' },
  component: () => <ComingSoon area="bank-farmers" />,
});
