import { createFileRoute } from '@tanstack/react-router';
import { parseBankQueueSearch } from '@/features/bank-details/bank-details';
import { BankQueue } from '@/features/bank-details/bank-queue';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/people/bank-details')({
  staticData: { area: 'people', page: '/people/bank-details' },
  validateSearch: onlyChecked(parseBankQueueSearch),
  component: function BankDetails() {
    return <BankQueue search={Route.useSearch()} />;
  },
});
