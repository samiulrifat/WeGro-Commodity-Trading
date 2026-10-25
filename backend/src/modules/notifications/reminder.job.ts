import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { poishaToTaka } from '../../blockchain/utils/money';
import { bdDate } from '../../common/time/bd-dates';
import {
  ScheduledJob,
  type ScheduledJobRunner,
} from '../../common/jobs/scheduled-job';
import { Role } from '../users/roles';
import { type Note, NotificationWriter } from './notification-writer';
import { NotificationCategory, NotificationKind } from './notification.enums';

const { REMINDER } = NotificationCategory;
const DAY_MS = 86_400_000;
/** Deadlines (reservation, deal payment, input sale): this long before. */
const DEADLINE_LEAD = '24 hours';
/** Voucher inactivity: this long before the limit, then when it is passed. */
const INACTIVITY_LEAD_DAYS = 3;
/** Receipt storage and bank permission: this long before. */
const EXPIRY_LEAD_DAYS = 7;

type Item = { userId: string; note: Note };

/**
 * Time-based reminders, by the ledger's clock. Each run asks, per kind, for
 * the records inside its reminder window (one index-backed query each) and
 * sends what has not been sent: every reminder's key names its occasion, so
 * a reminder goes out once however often the job runs. A deadline that is
 * moved (an extended receipt, renewed activity) is a new occasion.
 */
@Injectable()
@ScheduledJob({
  name: 'reminders',
  description:
    'Sends reminders before deadlines, inactivity limits and expiring storage or permission',
  every: 'REMINDER_SWEEP_MS',
})
export class ReminderJob implements ScheduledJobRunner {
  private readonly logger = new Logger(ReminderJob.name);
  private running?: Promise<number>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly writer: NotificationWriter,
    private readonly clock: ChainClock,
  ) {}

  /** Sends the reminders due now; returns how many were new. */
  run(): Promise<number> {
    this.running ??= this.sweep().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async sweep(): Promise<number> {
    const now = await this.clock.now();
    // Independent reads, each on its own pooled connection, then one insert
    // (atomic by itself; the dedupe key makes a repeat harmless).
    const m = this.dataSource.manager;
    const [admins, superAdmins] = await Promise.all([
      this.writer.withRole(m, [Role.ADMIN]),
      this.writer.withRole(m, [Role.SUPER_ADMIN]),
    ]);
    const batches = await Promise.all([
      this.reservations(m, now),
      this.deals(m, now),
      this.sales(m, now),
      this.vouchers(m, now, admins),
      this.receipts(m, now, admins),
      this.consents(m, now, superAdmins),
    ]);
    const sent = await this.writer.sendMany(m, batches.flat());
    if (sent > 0) this.logger.log(`Sent ${sent} reminder(s)`);
    return sent;
  }

  private async reservations(m: EntityManager, now: Date): Promise<Item[]> {
    const rows: Array<{
      id: string;
      investor_id: string;
      slots: number;
      expires_at: Date;
      title: string;
    }> = await m.query(
      `SELECT r.id, r.investor_id, r.slots, r.expires_at, p.title
         FROM reservations r JOIN projects p ON p.id = r.project_id
        WHERE r.status = 'pending' AND r.expires_at > $1
          AND r.expires_at <= $1::timestamptz + interval '${DEADLINE_LEAD}'`,
      [now],
    );
    return rows.map((r) => ({
      userId: r.investor_id,
      note: {
        category: REMINDER,
        kind: NotificationKind.RESERVATION_EXPIRING,
        title: `Your reservation of ${r.slots} slots expires soon`,
        body: `${r.title}: pay before ${utc(r.expires_at)} UTC or the slots are released`,
        params: {
          slots: r.slots,
          project: r.title,
          expiresAt: r.expires_at.toISOString(),
        },
        subject: { type: 'reservation', id: r.id },
        key: `reservation:${r.id}:expiring`,
      },
    }));
  }

  private async deals(m: EntityManager, now: Date): Promise<Item[]> {
    const rows: Array<{
      id: string;
      buyer_id: string;
      amount: string;
      payment_due_at: Date;
    }> = await m.query(
      `SELECT id, buyer_id, (unit_price * quantity)::text AS amount, payment_due_at FROM offers
        WHERE status = 'approved' AND payment_due_at > $1
          AND payment_due_at <= $1::timestamptz + interval '${DEADLINE_LEAD}'`,
      [now],
    );
    return rows.map((r) => ({
      userId: r.buyer_id,
      note: {
        category: REMINDER,
        kind: NotificationKind.DEAL_PAYMENT_DUE,
        title: `Payment for deal #${r.id} is due soon`,
        body: `${poishaToTaka(BigInt(r.amount))} taka by ${utc(r.payment_due_at)} UTC, or the deal lapses`,
        params: {
          offerId: r.id,
          amount: poishaToTaka(BigInt(r.amount)),
          paymentDueAt: r.payment_due_at.toISOString(),
        },
        subject: { type: 'offer', id: r.id },
        key: `deal:${r.id}:due`,
      },
    }));
  }

  private async sales(m: EntityManager, now: Date): Promise<Item[]> {
    const rows: Array<{
      id: string;
      officer_id: string | null;
      expires_at: Date;
    }> = await m.query(
      `SELECT s.id, f.field_officer_id AS officer_id, s.expires_at
           FROM voucher_sales s JOIN vouchers v ON v.id = s.voucher_id JOIN users f ON f.id = v.farmer_id
          WHERE s.status = 'pending' AND s.expires_at > $1
            AND s.expires_at <= $1::timestamptz + interval '${DEADLINE_LEAD}'`,
      [now],
    );
    return rows.flatMap((r) =>
      r.officer_id
        ? [
            {
              userId: r.officer_id,
              note: {
                category: REMINDER,
                kind: NotificationKind.SALE_CONFIRM_DUE,
                title: `Input sale #${r.id} lapses soon unless you confirm it`,
                body: `Confirm before ${utc(r.expires_at)} UTC`,
                params: { saleId: r.id, expiresAt: r.expires_at.toISOString() },
                subject: { type: 'voucher-sale', id: r.id },
                key: `sale:${r.id}:due`,
              },
            },
          ]
        : [],
    );
  }

  /** Nearing the limit (officer and admins), then past it (the same). */
  private async vouchers(
    m: EntityManager,
    now: Date,
    admins: string[],
  ): Promise<Item[]> {
    const rows: Array<{
      id: string;
      officer_id: string | null;
      deadline: Date;
      input_type_code: string;
      input: string | null;
      input_bn: string | null;
      title: string;
    }> = await m.query(
      `SELECT v.id, f.field_officer_id AS officer_id, v.input_type_code, p.title,
              i.name AS input, i.name_bn AS input_bn,
              v.last_activity_at + make_interval(days => v.inactivity_limit_days) AS deadline
         FROM vouchers v JOIN users f ON f.id = v.farmer_id JOIN projects p ON p.id = v.project_id
         LEFT JOIN input_types i ON i.code = v.input_type_code
        WHERE v.status = 'active' AND v.inactivity_limit_days IS NOT NULL
          AND v.last_activity_at + make_interval(days => v.inactivity_limit_days)
              <= $1::timestamptz + make_interval(days => ${INACTIVITY_LEAD_DAYS})`,
      [now],
    );
    return rows.flatMap((r) => {
      const passed = r.deadline.getTime() <= now.getTime();
      const note: Note = {
        category: REMINDER,
        kind: passed
          ? NotificationKind.VOUCHER_INACTIVE
          : NotificationKind.VOUCHER_INACTIVE_SOON,
        title: passed
          ? `Voucher for ${r.input_type_code} has passed its inactivity limit`
          : `Voucher for ${r.input_type_code} nears its inactivity limit`,
        body: `${r.title}: ${passed ? 'an admin decides what happens next' : `use it before ${utc(r.deadline)} UTC`}`,
        params: {
          input: r.input ?? r.input_type_code,
          inputBn: r.input_bn,
          project: r.title,
          deadline: r.deadline.toISOString(),
        },
        subject: { type: 'voucher', id: r.id },
        // Activity moves the deadline: a new occasion.
        key: `voucher:${r.id}:${passed ? 'inactive' : 'inactive-soon'}:${r.deadline.getTime() / 1000}`,
      };
      return [...new Set([r.officer_id, ...admins])]
        .filter((u): u is string => !!u)
        .map((userId) => ({ userId, note }));
    });
  }

  /** Storage ending within 7 days: the owner's side and the site's operators. */
  private async receipts(
    m: EntityManager,
    now: Date,
    admins: string[],
  ): Promise<Item[]> {
    const today = bdDate(now);
    const until = bdDate(new Date(now.getTime() + EXPIRY_LEAD_DAYS * DAY_MS));
    const rows: Array<{
      id: string;
      expires_on: string;
      owner_is_wegro: boolean;
      owner_id: string | null;
      officer_id: string | null;
      operators: string[] | null;
      quantity: string;
      produce_code: string;
      produce: string | null;
      produce_bn: string | null;
    }> = await m.query(
      `SELECT r.id, to_char(r.expires_on, 'YYYY-MM-DD') AS expires_on, r.owner_is_wegro, r.owner_id,
              f.field_officer_id AS officer_id, r.quantity, r.produce_code,
              pt.name AS produce, pt.name_bn AS produce_bn,
              (SELECT array_agg(w.operator_id) FROM warehouse_operators w WHERE w.site_id = r.site_id) AS operators
         FROM warehouse_receipts r LEFT JOIN users f ON f.id = r.owner_id
         LEFT JOIN produce_types pt ON pt.code = r.produce_code
        WHERE r.status IN ('issued', 'listed', 'pending_handover')
          AND r.expires_on >= $1::date AND r.expires_on <= $2::date`,
      [today, until],
    );
    return rows.flatMap((r) => {
      const note: Note = {
        category: REMINDER,
        kind: NotificationKind.RECEIPT_EXPIRING,
        title: `Storage of ${r.quantity} ${r.produce_code} ends on ${r.expires_on}`,
        body: 'Re-check and extend the receipt, sell, or collect the goods',
        params: {
          quantity: r.quantity,
          produce: r.produce ?? r.produce_code,
          produceBn: r.produce_bn,
          expiresOn: r.expires_on,
        },
        subject: { type: 'receipt', id: r.id.trim() },
        key: `receipt:${r.id.trim()}:expiring:${r.expires_on}`,
      };
      const owners = r.owner_is_wegro ? admins : [r.owner_id, r.officer_id];
      return [...new Set([...owners, ...(r.operators ?? [])])]
        .filter((u): u is string => !!u)
        .map((userId) => ({ userId, note }));
    });
  }

  /**
   * Bank permission ending within 7 days: the farmer and their officer, or
   * the super admin, who renews it for a farmer without one.
   */
  private async consents(
    m: EntityManager,
    now: Date,
    superAdmins: string[],
  ): Promise<Item[]> {
    const rows: Array<{
      id: string;
      farmer_id: string;
      officer_id: string | null;
      expires_at: Date;
      bank: string;
    }> = await m.query(
      `SELECT c.id, c.farmer_id, f.field_officer_id AS officer_id, c.expires_at,
              b.name || ', ' || b.branch_name AS bank
         FROM bank_consents c JOIN users f ON f.id = c.farmer_id JOIN banks b ON b.id = c.bank_id
        WHERE c.status = 'active' AND c.expires_at > $1
          AND c.expires_at <= $1::timestamptz + make_interval(days => ${EXPIRY_LEAD_DAYS})`,
      [now],
    );
    return rows.flatMap((r) => {
      const note: Note = {
        category: REMINDER,
        kind: NotificationKind.CONSENT_EXPIRING,
        title: `Permission for ${r.bank} ends soon`,
        body: `It ends at ${utc(r.expires_at)} UTC; renew it if the farmer agrees`,
        params: { bank: r.bank, expiresAt: r.expires_at.toISOString() },
        subject: { type: 'consent', id: r.id },
        key: `consent:${r.id}:expiring`,
      };
      return [
        r.farmer_id,
        ...(r.officer_id ? [r.officer_id] : superAdmins),
      ].map((userId) => ({ userId, note }));
    });
  }
}

const utc = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
