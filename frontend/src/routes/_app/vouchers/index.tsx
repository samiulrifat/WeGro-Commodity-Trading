import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/vouchers/')({
  staticData: { area: 'vouchers' },
  component: () => <ComingSoon area="vouchers" />,
});
