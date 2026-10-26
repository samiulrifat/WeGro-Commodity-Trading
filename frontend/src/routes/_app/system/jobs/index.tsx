import { createFileRoute } from '@tanstack/react-router';
import { JobsPage } from '@/features/system/jobs-page';

export const Route = createFileRoute('/_app/system/jobs/')({
  staticData: { area: 'system', page: '/system/jobs' },
  component: JobsPage,
});
