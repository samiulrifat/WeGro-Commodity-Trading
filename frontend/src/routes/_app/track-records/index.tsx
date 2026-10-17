import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/track-records/')({
  staticData: { area: 'track-records' },
  component: () => <ComingSoon area="track-records" />,
});
