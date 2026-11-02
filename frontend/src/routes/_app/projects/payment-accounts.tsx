import { createFileRoute } from '@tanstack/react-router';
import { PaymentAccountsPage } from '@/features/projects/payment-accounts-page';
import { parseRefundsSearch } from '@/features/projects/projects-search';
import { onlyChecked } from '@/lib/search';

export const Route = createFileRoute('/_app/projects/payment-accounts')({
  staticData: { area: 'projects', page: '/projects/payment-accounts' },
  validateSearch: onlyChecked(parseRefundsSearch),
  component: function PaymentAccounts() {
    return <PaymentAccountsPage search={Route.useSearch()} />;
  },
});
