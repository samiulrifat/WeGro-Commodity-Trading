import { createFileRoute } from '@tanstack/react-router';
import { RegisterPerson } from '@/features/people/register-person';

/** Admins, the super admin (staff) and field officers (farmers). */
export const Route = createFileRoute('/_app/people/new')({
  staticData: { area: 'people', page: '/people/new' },
  component: RegisterPerson,
});
