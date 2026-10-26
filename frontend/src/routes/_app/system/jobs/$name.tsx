import { createFileRoute } from '@tanstack/react-router';
import { JobRunsPage } from '@/features/system/job-runs-page';

export const Route = createFileRoute('/_app/system/jobs/$name')({
  staticData: { area: 'system', page: '/system/jobs' },
  component: function JobRuns() {
    return <JobRunsPage name={Route.useParams().name} />;
  },
});
