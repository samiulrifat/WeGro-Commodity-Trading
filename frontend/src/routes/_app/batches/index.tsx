import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/batches/')({
  staticData: { area: 'batches' },
  component: () => <ComingSoon area="batches" />,
});
