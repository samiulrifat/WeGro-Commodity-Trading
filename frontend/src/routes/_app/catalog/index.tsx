import { createFileRoute, Navigate } from '@tanstack/react-router';
import { navFor } from '@/app/navigation';
import { useAppSelector } from '@/store/hooks';

/** The catalog opens on the first of the lists this role sees. */
export const Route = createFileRoute('/_app/catalog/')({
  staticData: { area: 'catalog' },
  component: function CatalogHome() {
    const user = useAppSelector((s) => s.session.user!);
    const first = navFor(user).find((n) => n.area === 'catalog')?.pages?.[0];
    return <Navigate to={first?.to ?? '/catalog/produce'} replace />;
  },
});
