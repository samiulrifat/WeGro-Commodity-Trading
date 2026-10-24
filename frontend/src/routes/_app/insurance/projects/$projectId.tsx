import { createFileRoute } from '@tanstack/react-router';
import { InsuredProjectPage } from '@/features/insurance/insured-project-page';

export const Route = createFileRoute('/_app/insurance/projects/$projectId')({
  staticData: { area: 'insurance' },
  component: function InsuredProject() {
    return <InsuredProjectPage projectId={Route.useParams().projectId} />;
  },
});
