import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { FarmerRecordPage } from '@/features/track-records/farmer-record-page';
import { FarmersList } from '@/features/track-records/farmers-list';
import { useAppSelector } from '@/store/hooks';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/track-records/')({
  staticData: { area: 'track-records' },
  validateSearch: onlyChecked(parseMarketSearch),
  component: function TrackRecords() {
    const user = useAppSelector((s) => s.session.user!);
    const search = Route.useSearch();
    // A farmer's own track record; everyone else the list of farmers.
    return user.role === 'farmer' ? (
      <FarmerRecordPage farmerId={user.id} own />
    ) : (
      <FarmersList search={search} />
    );
  },
});
