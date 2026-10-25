import { createFileRoute } from '@tanstack/react-router';
import { parseMarketSearch } from '@/features/marketplace/market-utils';
import { PermissionsList } from '@/features/track-records/permissions-list';

export const Route = createFileRoute('/_app/track-records/permissions')({
  staticData: { area: 'track-records', page: '/track-records/permissions' },
  validateSearch: parseMarketSearch,
  component: function BankPermissions() {
    return <PermissionsList search={Route.useSearch()} />;
  },
});
