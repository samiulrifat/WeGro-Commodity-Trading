import { createFileRoute } from '@tanstack/react-router';
import { parseBankQueueSearch } from '@/features/bank-details/bank-details';
import { BankQueue } from '@/features/bank-details/bank-queue';

export const Route = createFileRoute('/_app/people/bank-details')({
  staticData: { area: 'people', page: '/people/bank-details' },
  validateSearch: parseBankQueueSearch,
  component: function BankDetails() {
    return <BankQueue search={Route.useSearch()} />;
  },
});
