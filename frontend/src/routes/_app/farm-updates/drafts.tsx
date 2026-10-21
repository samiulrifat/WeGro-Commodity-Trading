import { createFileRoute } from '@tanstack/react-router';
import { DraftsPage } from '@/features/farm-updates/drafts-page';

export const Route = createFileRoute('/_app/farm-updates/drafts')({
  staticData: { area: 'farm-updates', page: '/farm-updates/drafts' },
  component: DraftsPage,
});
