import { createFileRoute } from '@tanstack/react-router';
import { ListingPage } from '@/features/marketplace/listing-page';

export const Route = createFileRoute('/_app/marketplace/listings/$listingId')({
  staticData: { area: 'marketplace' },
  component: function Listing() {
    return <ListingPage id={Number(Route.useParams().listingId)} />;
  },
});
