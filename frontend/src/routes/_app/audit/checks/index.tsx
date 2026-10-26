import { createFileRoute } from '@tanstack/react-router';
import { ChecksPage } from '@/features/audit/checks-page';

export const Route = createFileRoute('/_app/audit/checks/')({
  staticData: { area: 'audit', page: '/audit/checks' },
  component: ChecksPage,
});
