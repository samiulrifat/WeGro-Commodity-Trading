import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/warehouse/')({
  staticData: { area: 'warehouse' },
  component: () => <ComingSoon area="warehouse" />,
});
