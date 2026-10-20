import { createFileRoute } from '@tanstack/react-router';
import { BookingPage } from '@/features/projects/booking-page';

export const Route = createFileRoute('/_app/holdings/bookings/$bookingId')({
  staticData: { area: 'holdings' },
  component: function Booking() {
    return <BookingPage id={Number(Route.useParams().bookingId)} />;
  },
});
