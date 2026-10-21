import { createFileRoute } from '@tanstack/react-router';
import { NewUpdatePage } from '@/features/farm-updates/new-update-page';
import { parseNewUpdateSearch } from '@/features/farm-updates/search';

export const Route = createFileRoute('/_app/farm-updates/')({
  staticData: { area: 'farm-updates' },
  validateSearch: parseNewUpdateSearch,
  component: function NewUpdate() {
    return <NewUpdatePage search={Route.useSearch()} />;
  },
});
