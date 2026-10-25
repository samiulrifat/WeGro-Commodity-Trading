import { createFileRoute } from '@tanstack/react-router';
import { FarmerRecordPage } from '@/features/track-records/farmer-record-page';

export const Route = createFileRoute('/_app/track-records/farmers/$farmerId')({
  staticData: { area: 'track-records' },
  component: function FarmerRecord() {
    return <FarmerRecordPage farmerId={Route.useParams().farmerId} />;
  },
});
