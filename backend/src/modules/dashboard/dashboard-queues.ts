import { Role, STAFF_ROLES } from '../users/roles';

/** Roles with a dashboard. */
export const DASHBOARD_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
] as const;

/**
 * One "waiting for someone" queue. `count` and `items` share a WHERE that a
 * partial or composite index serves, so both stay cheap however long the
 * queue is; `items` returns the 5 waiting longest. `$1` is the ledger's
 * current time where a query needs it.
 */
export interface QueueDef {
  key: string;
  title: string;
  /** Who acts on it. */
  actionBy: string;
  /** Dashboard roles that see it (super admin and auditor see every queue). */
  roles: readonly Role[];
  count: string;
  /**
   * Columns: id, title, detail, person_id, project_id, project_title, since,
   * params (the item's values, for wording it in the reader's language;
   * money in poisha under ITEM_MONEY's keys).
   */
  items: string;
  /** Urgent subsets, each a COUNT. */
  urgent?: Record<string, string>;
}

/** Item params holding poisha, sent as taka. */
export const ITEM_MONEY = new Set(['value', 'unitPrice', 'amount']);

const ADMIN = [Role.ADMIN];
const ACCOUNTS = [Role.ACCOUNTS, Role.ADMIN];
const INPUTS = [Role.OPERATIONS, Role.ADMIN];

const staffRoles = [...STAFF_ROLES].map((r) => `'${r}'`).join(', ');

/**
 * Participants waiting for verification. The super admin verifies staff and
 * sees everyone; an admin verifies everyone else.
 */
function participants(onlyNonStaff: boolean): QueueDef {
  const where = `status = 'pending' AND chain_state = 'confirmed' AND role <> 'super_admin'${
    onlyNonStaff ? ` AND role NOT IN (${staffRoles})` : ''
  }`;
  return {
    key: 'participants.pending',
    title: 'Participants awaiting verification',
    actionBy: onlyNonStaff ? 'admin' : 'super admin (staff), admin (others)',
    roles: [],
    count: `SELECT COUNT(*) AS n FROM users WHERE ${where}`,
    items: `SELECT id::text AS id, 'Registration' AS title, role AS detail, id AS person_id,
                   NULL::uuid AS project_id, NULL AS project_title, created_at AS since,
                   json_build_object('role', role) AS params
              FROM users WHERE ${where} ORDER BY created_at LIMIT 5`,
  };
}

export function queuesFor(role: Role): QueueDef[] {
  const all = role === Role.SUPER_ADMIN || role === Role.AUDITOR;
  const list: QueueDef[] = [
    ...(all || role === Role.ADMIN ? [participants(!all)] : []),
    ...QUEUES,
  ];
  return list.filter(
    (q) => q.key === 'participants.pending' || all || q.roles.includes(role),
  );
}

const QUEUES: QueueDef[] = [
  {
    key: 'bank-accounts.pending',
    title: 'Bank details awaiting verification',
    actionBy: 'admin (not the one who entered them)',
    roles: ADMIN,
    count: `SELECT COUNT(*) AS n FROM bank_accounts WHERE status = 'pending'`,
    items: `SELECT b.id::text AS id,
                   CASE WHEN EXISTS (SELECT 1 FROM bank_accounts v
                                      WHERE v.user_id = b.user_id AND v.status = 'verified')
                        THEN 'Change of bank details' ELSE 'New bank details' END AS title,
                   NULL AS detail, b.user_id AS person_id, NULL::uuid AS project_id,
                   NULL AS project_title, b.created_at AS since,
                   json_build_object('change', EXISTS (SELECT 1 FROM bank_accounts v WHERE v.user_id = b.user_id AND v.status = 'verified')) AS params
              FROM bank_accounts b WHERE b.status = 'pending' ORDER BY b.created_at LIMIT 5`,
  },
  {
    key: 'reservations.pending',
    title: 'Reservations awaiting payment confirmation',
    actionBy: 'accounts',
    roles: ACCOUNTS,
    count: `SELECT COUNT(*) AS n FROM reservations WHERE status = 'pending'`,
    items: `SELECT r.id::text AS id, 'Reservation #' || r.id AS title, r.slots || ' slots' AS detail,
                   r.investor_id AS person_id, r.project_id, p.title AS project_title, r.reserved_at AS since,
                   json_build_object('id', r.id, 'slots', r.slots) AS params
              FROM reservations r JOIN projects p ON p.id = r.project_id
             WHERE r.status = 'pending' ORDER BY r.expires_at LIMIT 5`,
    urgent: {
      expiringSoon: `SELECT COUNT(*) AS n FROM reservations
                      WHERE status = 'pending' AND expires_at <= $1::timestamptz + interval '24 hours'`,
    },
  },
  {
    key: 'vouchers.proposed',
    title: 'Vouchers awaiting approval',
    actionBy: 'accounts',
    roles: [Role.ACCOUNTS, Role.OPERATIONS, Role.ADMIN],
    count: `SELECT COUNT(*) AS n FROM vouchers WHERE status = 'proposed'`,
    items: `SELECT v.id::text AS id, 'Voucher: ' || v.quantity || ' ' || v.input_type_code AS title,
                   'value ' || (v.value / 100) || '.' || lpad((v.value % 100)::text, 2, '0') AS detail,
                   v.proposed_by_id AS person_id, v.project_id, p.title AS project_title,
                   COALESCE(v.proposed_at, v.created_at) AS since,
                   json_build_object('quantity', v.quantity::text, 'input', v.input_type_code, 'value', v.value::text) AS params
              FROM vouchers v JOIN projects p ON p.id = v.project_id
             WHERE v.status = 'proposed' ORDER BY v.proposed_at LIMIT 5`,
  },
  {
    key: 'voucher-sales.pending',
    title: 'Input sales awaiting the field officer',
    actionBy: "the farmer's field officer",
    roles: INPUTS,
    count: `SELECT COUNT(*) AS n FROM voucher_sales WHERE status = 'pending'`,
    items: `SELECT s.id::text AS id, 'Input sale #' || s.id AS title,
                   s.quantity || ' ' || v.input_type_code AS detail, s.supplier_id AS person_id,
                   v.project_id, p.title AS project_title, s.recorded_at AS since,
                   json_build_object('id', s.id, 'quantity', s.quantity::text, 'input', v.input_type_code) AS params
              FROM voucher_sales s JOIN vouchers v ON v.id = s.voucher_id JOIN projects p ON p.id = v.project_id
             WHERE s.status = 'pending' ORDER BY s.expires_at LIMIT 5`,
    urgent: {
      expiringSoon: `SELECT COUNT(*) AS n FROM voucher_sales
                      WHERE status = 'pending' AND expires_at <= $1::timestamptz + interval '24 hours'`,
    },
  },
  {
    key: 'vouchers.inactive',
    title: 'Vouchers past their inactivity limit',
    actionBy: 'admin decides',
    roles: INPUTS,
    count: `SELECT COUNT(*) AS n FROM vouchers
             WHERE status = 'active' AND inactivity_limit_days IS NOT NULL
               AND last_activity_at + make_interval(days => inactivity_limit_days) <= $1::timestamptz`,
    items: `SELECT v.id::text AS id, 'Voucher: ' || v.quantity || ' ' || v.input_type_code AS title,
                   'limit ' || v.inactivity_limit_days || ' days' AS detail, v.farmer_id AS person_id,
                   v.project_id, p.title AS project_title,
                   v.last_activity_at + make_interval(days => v.inactivity_limit_days) AS since,
                   json_build_object('quantity', v.quantity::text, 'input', v.input_type_code, 'days', v.inactivity_limit_days) AS params
              FROM vouchers v JOIN projects p ON p.id = v.project_id
             WHERE v.status = 'active' AND v.inactivity_limit_days IS NOT NULL
               AND v.last_activity_at + make_interval(days => v.inactivity_limit_days) <= $1::timestamptz
             ORDER BY v.last_activity_at LIMIT 5`,
  },
  {
    key: 'offers.pending',
    title: 'Offers awaiting approval',
    actionBy: 'admin',
    roles: ADMIN,
    count: `SELECT COUNT(*) AS n FROM offers WHERE status = 'pending'`,
    items: `SELECT o.id::text AS id, 'Offer #' || o.id || ' on listing #' || o.listing_id AS title,
                   o.quantity || ' ' || l.produce_code || ' at ' || (o.unit_price / 100) || '.'
                     || lpad((o.unit_price % 100)::text, 2, '0') AS detail,
                   o.buyer_id AS person_id, l.project_id, p.title AS project_title, o.made_at AS since,
                   json_build_object('id', o.id, 'listing', o.listing_id, 'quantity', o.quantity::text, 'produce', l.produce_code, 'unitPrice', o.unit_price::text) AS params
              FROM offers o JOIN listings l ON l.id = o.listing_id JOIN projects p ON p.id = l.project_id
             WHERE o.status = 'pending' ORDER BY o.made_at LIMIT 5`,
  },
  {
    key: 'deals.awaiting-payment',
    title: 'Deals awaiting buyer payment confirmation',
    actionBy: 'accounts',
    roles: ACCOUNTS,
    count: `SELECT COUNT(*) AS n FROM offers WHERE status = 'approved'`,
    items: `SELECT o.id::text AS id, 'Deal #' || o.id AS title,
                   o.quantity || ' ' || l.produce_code || ', due' AS detail,
                   o.buyer_id AS person_id, l.project_id, p.title AS project_title, o.payment_due_at AS since,
                   json_build_object('id', o.id, 'quantity', o.quantity::text, 'produce', l.produce_code) AS params
              FROM offers o JOIN listings l ON l.id = o.listing_id JOIN projects p ON p.id = l.project_id
             WHERE o.status = 'approved' ORDER BY o.payment_due_at LIMIT 5`,
    urgent: {
      overdue: `SELECT COUNT(*) AS n FROM offers
                 WHERE status = 'approved' AND payment_due_at <= $1::timestamptz`,
    },
  },
  {
    key: 'deliveries.discrepancy',
    title: 'Paid deals with a delivery quantity that differs',
    actionBy: 'admin',
    roles: ADMIN,
    count: `SELECT COUNT(*) AS n FROM offers o
             WHERE o.status = 'paid' AND EXISTS (SELECT 1 FROM deliveries d
                     WHERE d.offer_id = o.id AND d.status = 'recorded' AND d.quantity <> o.quantity)`,
    items: `SELECT o.id::text AS id, 'Deal #' || o.id AS title,
                   'deal ' || o.quantity || ', confirmed ' ||
                     (SELECT string_agg(d.side || ' ' || d.quantity, ', ' ORDER BY d.side)
                        FROM deliveries d WHERE d.offer_id = o.id AND d.status = 'recorded') AS detail,
                   o.buyer_id AS person_id, l.project_id, p.title AS project_title, o.paid_at AS since,
                   json_build_object('id', o.id, 'quantity', o.quantity::text, 'produce', l.produce_code, 'buyer', (SELECT d.quantity::text FROM deliveries d WHERE d.offer_id = o.id AND d.status = 'recorded' AND d.side = 'buyer'),
                     'handler', (SELECT d.quantity::text FROM deliveries d WHERE d.offer_id = o.id AND d.status = 'recorded' AND d.side = 'handler')) AS params
              FROM offers o JOIN listings l ON l.id = o.listing_id JOIN projects p ON p.id = l.project_id
             WHERE o.status = 'paid' AND EXISTS (SELECT 1 FROM deliveries d
                     WHERE d.offer_id = o.id AND d.status = 'recorded' AND d.quantity <> o.quantity)
             ORDER BY o.paid_at LIMIT 5`,
  },
  {
    key: 'handovers.pending',
    title: 'Buy-back handovers awaiting an admin',
    actionBy: 'admin',
    roles: ADMIN,
    count: `SELECT COUNT(*) AS n FROM warehouse_receipts WHERE status = 'pending_handover'`,
    items: `SELECT r.id AS id, 'Receipt ' || left(r.id, 10) || '…' AS title,
                   r.quantity || ' ' || r.produce_code AS detail, r.owner_id AS person_id,
                   r.project_id, p.title AS project_title, r.handover_offered_at AS since,
                   json_build_object('receipt', left(r.id, 10), 'quantity', r.quantity::text, 'produce', r.produce_code) AS params
              FROM warehouse_receipts r JOIN projects p ON p.id = r.project_id
             WHERE r.status = 'pending_handover' ORDER BY r.handover_offered_at LIMIT 5`,
  },
  {
    key: 'rounds.awaiting-approval',
    title: 'Payout rounds awaiting a second approval',
    actionBy: 'accounts (not the one who prepared it)',
    roles: ACCOUNTS,
    count: `SELECT COUNT(*) AS n FROM settlement_rounds WHERE status = 'prepared'`,
    items: `SELECT r.id::text AS id,
                   'Round #' || r.id || CASE WHEN r.is_final THEN ' (final)' ELSE ' (staged)' END AS title,
                   r.payee_count || ' payees' AS detail, r.prepared_by_id AS person_id,
                   r.project_id, p.title AS project_title, r.prepared_at AS since,
                   json_build_object('id', r.id, 'final', r.is_final, 'payees', r.payee_count) AS params
              FROM settlement_rounds r JOIN projects p ON p.id = r.project_id
             WHERE r.status = 'prepared' ORDER BY r.prepared_at LIMIT 5`,
  },
  {
    key: 'rounds.unpaid',
    title: 'Approved payout rounds with unpaid lines',
    actionBy: 'accounts',
    roles: ACCOUNTS,
    count: `SELECT COUNT(*) AS n FROM settlement_rounds WHERE status = 'approved'`,
    items: `SELECT r.id::text AS id, 'Round #' || r.id AS title,
                   r.paid_count || ' of ' || r.payee_count || ' paid' AS detail, r.approved_by_id AS person_id,
                   r.project_id, p.title AS project_title, r.approved_at AS since,
                   json_build_object('id', r.id, 'paid', r.paid_count, 'payees', r.payee_count) AS params
              FROM settlement_rounds r JOIN projects p ON p.id = r.project_id
             WHERE r.status = 'approved' ORDER BY r.approved_at LIMIT 5`,
  },
  {
    key: 'projects.ready-for-settlement',
    title: 'Projects ready for sale with no final round yet',
    actionBy: 'accounts',
    roles: ACCOUNTS,
    count: `SELECT COUNT(*) AS n FROM projects p
             WHERE p.stage = 'ready_for_sale' AND NOT EXISTS (SELECT 1 FROM settlement_rounds r
                     WHERE r.project_id = p.id AND r.is_final AND r.status IN ('prepared', 'approved', 'paid'))`,
    items: `SELECT p.id::text AS id, 'Final payout due' AS title, p.produce_code AS detail,
                   p.farmer_id AS person_id, p.id AS project_id, p.title AS project_title,
                   p.stage_changed_at AS since,
                   json_build_object('produce', p.produce_code) AS params
              FROM projects p
             WHERE p.stage = 'ready_for_sale' AND NOT EXISTS (SELECT 1 FROM settlement_rounds r
                     WHERE r.project_id = p.id AND r.is_final AND r.status IN ('prepared', 'approved', 'paid'))
             ORDER BY p.stage_changed_at LIMIT 5`,
  },
  {
    key: 'claims.open',
    title: 'Insurance claims awaiting the insurer',
    actionBy: "the project's insurer",
    roles: ADMIN,
    count: `SELECT COUNT(*) AS n FROM insurance_claims WHERE status IN ('triggered', 'under_review')`,
    items: `SELECT c.id::text AS id, 'Claim (' || replace(c.status, '_', ' ') || ')' AS title,
                   c.damage_percent || '% damage' AS detail, c.opened_by_id AS person_id,
                   c.project_id, p.title AS project_title, c.opened_at AS since,
                   json_build_object('status', c.status, 'damage', c.damage_percent::text) AS params
              FROM insurance_claims c JOIN projects p ON p.id = c.project_id
             WHERE c.status IN ('triggered', 'under_review') ORDER BY c.opened_at LIMIT 5`,
  },
  {
    key: 'claims.payment-due',
    title: "Approved insurance claims waiting for the insurer's payment",
    actionBy: 'Accounts',
    roles: ACCOUNTS,
    count: `SELECT COUNT(*) AS n FROM insurance_claims WHERE status = 'approved'`,
    items: `SELECT c.id::text AS id, 'Claim approved' AS title,
                   (c.approved_amount / 100)::text || ' taka' AS detail, c.opened_by_id AS person_id,
                   c.project_id, p.title AS project_title, c.decided_at AS since,
                   json_build_object('amount', c.approved_amount::text) AS params
              FROM insurance_claims c JOIN projects p ON p.id = c.project_id
             WHERE c.status = 'approved' ORDER BY c.decided_at LIMIT 5`,
  },
];
