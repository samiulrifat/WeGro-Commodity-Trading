import type { Role } from '@/app/navigation';

/** Who drafts, publishes and moves projects: admins, and the super admin. */
export const canRunProjects = (role: Role) =>
  role === 'admin' || role === 'super_admin';
