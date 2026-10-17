import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/statement/')({
  staticData: { area: 'statement' },
  component: () => <ComingSoon area="statement" />,
});
