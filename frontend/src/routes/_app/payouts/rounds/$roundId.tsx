import { createFileRoute } from '@tanstack/react-router';
import { RoundPage } from '@/features/payouts/round-page';

export const Route = createFileRoute('/_app/payouts/rounds/$roundId')({
  staticData: { area: 'payouts' },
  component: function Round() {
    return <RoundPage id={Number(Route.useParams().roundId)} />;
  },
});
