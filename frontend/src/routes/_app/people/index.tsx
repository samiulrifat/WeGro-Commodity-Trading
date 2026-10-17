import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/people/')({
  staticData: { area: 'people' },
  component: () => <ComingSoon area="people" />,
});
