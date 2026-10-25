import { createFileRoute } from '@tanstack/react-router';
import { BankViewPage } from '@/features/track-records/bank-view-page';

export const Route = createFileRoute('/_app/bank/farmers/$farmerId')({
  staticData: { area: 'bank-farmers' },
  component: function BankView() {
    return <BankViewPage farmerId={Route.useParams().farmerId} />;
  },
});
