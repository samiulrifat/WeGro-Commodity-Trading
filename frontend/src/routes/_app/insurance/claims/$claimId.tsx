import { createFileRoute } from '@tanstack/react-router';
import { ClaimPage } from '@/features/insurance/claim-page';

export const Route = createFileRoute('/_app/insurance/claims/$claimId')({
  staticData: { area: 'insurance' },
  component: function Claim() {
    return <ClaimPage id={Route.useParams().claimId} />;
  },
});
