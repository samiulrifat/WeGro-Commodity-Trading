import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/app/pages';

export const Route = createFileRoute('/_app/catalog/')({
  staticData: { area: 'catalog' },
  component: () => <ComingSoon area="catalog" />,
});
