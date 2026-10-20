import { createFileRoute } from '@tanstack/react-router';
import { HoldingsPage } from '@/features/projects/holdings-page';

export const Route = createFileRoute('/_app/holdings/')({
  staticData: { area: 'holdings' },
  component: () => <HoldingsPage />,
});
