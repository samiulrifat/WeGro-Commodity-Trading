import { createFileRoute } from '@tanstack/react-router';
import { SweepPage } from '@/features/audit/sweep-page';

export const Route = createFileRoute('/_app/audit/checks/$sweepId')({
  staticData: { area: 'audit', page: '/audit/checks' },
  component: function Sweep() {
    return <SweepPage id={Route.useParams().sweepId} />;
  },
});
