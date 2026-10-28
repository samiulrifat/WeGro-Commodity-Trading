import { createFileRoute } from '@tanstack/react-router';
import { dashboardApi } from '@/api/generated/dashboard';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

export const Route = createFileRoute('/_app/dashboard/')({
  staticData: { area: 'dashboard' },
  // The figures are asked for as soon as the session is known, while the
  // page's code loads: the staff's home page opens a round trip sooner.
  loader: ({ context: { store } }) => {
    store.dispatch(dashboardApi.util.prefetch('dashboardGet', undefined, {}));
  },
  component: DashboardPage,
});
