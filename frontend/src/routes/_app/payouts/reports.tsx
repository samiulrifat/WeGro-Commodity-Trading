import { createFileRoute } from '@tanstack/react-router';
import { ReportsPage } from '@/features/payouts/reports-page';

export const Route = createFileRoute('/_app/payouts/reports')({
  staticData: { area: 'payouts', page: '/payouts/reports' },
  component: ReportsPage,
});
