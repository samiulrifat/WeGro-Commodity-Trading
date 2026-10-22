import { createFileRoute } from '@tanstack/react-router';
import { DealPage } from '@/features/marketplace/deal-page';

export const Route = createFileRoute('/_app/marketplace/deals/$offerId')({
  staticData: { area: 'marketplace' },
  component: function Deal() {
    return <DealPage id={Number(Route.useParams().offerId)} />;
  },
});
