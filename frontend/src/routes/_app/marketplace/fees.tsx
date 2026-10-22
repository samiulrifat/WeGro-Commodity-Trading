import { createFileRoute } from '@tanstack/react-router';
import { FeesPage } from '@/features/marketplace/fees-page';

export const Route = createFileRoute('/_app/marketplace/fees')({
  staticData: { area: 'marketplace', page: '/marketplace/fees' },
  component: FeesPage,
});
