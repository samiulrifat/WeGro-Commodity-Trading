import { createFileRoute } from '@tanstack/react-router';
import { ProjectSettlementPage } from '@/features/payouts/project-settlement-page';

export const Route = createFileRoute('/_app/payouts/projects/$projectId')({
  staticData: { area: 'payouts' },
  component: function ProjectSettlement() {
    return <ProjectSettlementPage projectId={Route.useParams().projectId} />;
  },
});
