import { createFileRoute } from '@tanstack/react-router';
import { PaymentsQueue } from '@/features/projects/payments-queue';
import { parsePaymentsSearch } from '@/features/projects/projects-search';

export const Route = createFileRoute('/_app/projects/payments')({
  staticData: { area: 'projects', page: '/projects/payments' },
  validateSearch: parsePaymentsSearch,
  component: function Payments() {
    return <PaymentsQueue search={Route.useSearch()} />;
  },
});
