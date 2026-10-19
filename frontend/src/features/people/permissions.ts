import { isStaff, type Role } from '@/app/navigation';

/**
 * Who verifies, rejects, resets and re-keys a person, as the backend and the
 * ledger have it: staff by the super admin, everyone else by an admin.
 */
export function canManage(viewer: Role, person: Role): boolean {
  return isStaff(person) ? viewer === 'super_admin' : viewer === 'admin';
}

/** Which roles a viewer registers (field officers: farmers only). */
export function registrableRoles(viewer: Role): readonly Role[] {
  switch (viewer) {
    case 'super_admin':
      return ['admin', 'accounts', 'operations', 'field_officer', 'auditor'];
    case 'admin':
      return [
        'farmer',
        'investor',
        'buyer',
        'supplier',
        'bank',
        'warehouse',
        'insurer',
      ];
    case 'field_officer':
      return ['farmer'];
    default:
      return [];
  }
}
