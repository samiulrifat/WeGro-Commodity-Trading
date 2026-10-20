import type { EntityManager } from 'typeorm';
import { Role } from '../users/roles';
import { OpenWorkKind } from './revocation';

const NOT_FINISHED = `('paid_out', 'closed', 'cancelled')`;

/**
 * What each role can leave open, as counts over the person's id ($1). Read
 * straight from the tables, so this module needs none of the others.
 */
const QUERIES: Partial<Record<Role, [OpenWorkKind, string][]>> = {
  [Role.FIELD_OFFICER]: [
    [
      OpenWorkKind.FARMERS_ASSIGNED,
      `SELECT count(*) FROM users WHERE field_officer_id = $1`,
    ],
    [
      OpenWorkKind.CLAIMS_OPEN,
      `SELECT count(*) FROM insurance_claims
        WHERE opened_by_id = $1 AND status IN ('submitted', 'triggered', 'under_review')`,
    ],
  ],
  [Role.OPERATIONS]: [
    [
      OpenWorkKind.VOUCHERS_PROPOSED,
      `SELECT count(*) FROM vouchers
        WHERE proposed_by_id = $1 AND status IN ('submitted', 'proposed')`,
    ],
  ],
  [Role.ACCOUNTS]: [
    [
      OpenWorkKind.ROUNDS_PREPARED,
      `SELECT count(*) FROM settlement_rounds
        WHERE prepared_by_id = $1 AND status = 'prepared'`,
    ],
  ],
  [Role.ADMIN]: [
    [
      OpenWorkKind.DRAFT_PROJECTS,
      `SELECT count(*) FROM projects WHERE created_by_id = $1 AND stage = 'draft'`,
    ],
    [
      OpenWorkKind.BANK_DETAILS_ENTERED,
      `SELECT count(*) FROM bank_accounts
        WHERE entered_by_id = $1 AND status = 'pending' AND user_id <> $1`,
    ],
    [
      OpenWorkKind.CLAIMS_OPEN,
      `SELECT count(*) FROM insurance_claims
        WHERE opened_by_id = $1 AND status IN ('submitted', 'triggered', 'under_review')`,
    ],
  ],
  [Role.FARMER]: [
    [
      OpenWorkKind.PROJECTS_RUNNING,
      `SELECT count(*) FROM projects
        WHERE farmer_id = $1 AND stage NOT IN ${NOT_FINISHED}`,
    ],
  ],
  [Role.INVESTOR]: [
    [
      OpenWorkKind.HOLDINGS_RUNNING,
      `SELECT count(DISTINCT r.project_id) FROM reservations r
         JOIN projects p ON p.id = r.project_id
        WHERE r.investor_id = $1 AND r.status IN ('pending', 'confirmed')
          AND p.stage NOT IN ${NOT_FINISHED}`,
    ],
  ],
  [Role.BUYER]: [
    [
      OpenWorkKind.OFFERS_OPEN,
      `SELECT count(*) FROM offers
        WHERE buyer_id = $1 AND status IN ('pending', 'approved', 'paid')`,
    ],
  ],
  [Role.SUPPLIER]: [
    [
      OpenWorkKind.VOUCHERS_TO_FILL,
      `SELECT count(*) FROM voucher_suppliers s
         JOIN vouchers v ON v.id = s.voucher_id
        WHERE s.supplier_id = $1 AND v.status = 'active'`,
    ],
  ],
  [Role.BANK]: [
    [
      OpenWorkKind.BANK_ASSIGNED,
      `SELECT count(*) FROM bank_officers WHERE officer_id = $1 AND bank_id IS NOT NULL`,
    ],
  ],
  [Role.WAREHOUSE]: [
    [
      OpenWorkKind.SITE_ASSIGNED,
      `SELECT count(*) FROM warehouse_operators WHERE operator_id = $1 AND site_id IS NOT NULL`,
    ],
  ],
};

export interface OpenWorkItem {
  kind: OpenWorkKind;
  count: number;
}

/** What `userId` (of `role`) still has open; only kinds with something in them. */
export async function openWorkOf(
  m: EntityManager,
  userId: string,
  role: Role,
): Promise<OpenWorkItem[]> {
  const queries = QUERIES[role] ?? [];
  const counts = await Promise.all(
    queries.map(async ([kind, sql]) => {
      const rows: Array<{ count: string | number }> = await m.query(sql, [
        userId,
      ]);
      return { kind, count: Number(rows[0]?.count ?? 0) };
    }),
  );
  return counts.filter((c) => c.count > 0);
}
