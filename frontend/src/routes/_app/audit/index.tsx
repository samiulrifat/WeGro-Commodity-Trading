import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/audit/')({
  staticData: { area: 'audit' },
  component: () => <ComingSoon area="audit" />,
});
