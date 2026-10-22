import type { EntityManager } from 'typeorm';
import { bytes32ToUuid, SUPER_ADMIN_ID } from './ids';

/**
 * The user behind a participant id in a ledger record ("prepared by",
 * "approved by"): a participant's uuid, or the super admin's user for
 * SUPER_ADMIN_ID. Null when it is neither.
 */
export async function personId(
  m: EntityManager,
  value: unknown,
): Promise<string | null> {
  if (typeof value !== 'string') return null;
  if (value.toLowerCase() === SUPER_ADMIN_ID) {
    const rows: { id: string }[] = await m.query(
      `SELECT "id" FROM "users" WHERE "role" = 'super_admin' LIMIT 1`,
    );
    return rows[0]?.id ?? null;
  }
  try {
    return bytes32ToUuid(value);
  } catch {
    return null;
  }
}
