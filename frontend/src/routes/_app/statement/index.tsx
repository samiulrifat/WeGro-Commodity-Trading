import { createFileRoute } from '@tanstack/react-router';
import { MyStatementPage } from '@/features/payouts/my-statement-page';

export const Route = createFileRoute('/_app/statement/')({
  staticData: { area: 'statement' },
  component: MyStatementPage,
});
