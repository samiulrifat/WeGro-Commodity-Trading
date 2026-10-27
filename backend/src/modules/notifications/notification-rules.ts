import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ContractName } from '../../blockchain/contracts.registry';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToCode, bytes32ToUuid } from '../../blockchain/utils/ids';
import { poishaToTaka } from '../../blockchain/utils/money';
import { WEGRO_OWNER } from '../warehouse/warehouse.enums';
import { ROLE_BY_CHAIN_ID, Role, STAFF_ROLES } from '../users/roles';
import { type Note, NotificationWriter } from './notification-writer';
import { NotificationCategory, NotificationKind } from './notification.enums';

const { ACTION, OUTCOME } = NotificationCategory;

type Rule = (e: ChainEvent, m: EntityManager, ctx: Context) => Promise<unknown>;

/** What every rule needs: the writer, lookups, and a per-event dedupe key. */
class Context {
  constructor(
    private readonly writer: NotificationWriter,
    private readonly m: EntityManager,
    private readonly e: ChainEvent,
  ) {}

  private doerId: Promise<string | null> | null = null;

  /** Occasion key: this event, this kind of notice. */
  key(kind: string): string {
    return `ev:${this.e.blockNumber}:${this.e.logIndex}:${kind}`;
  }

  /** Whose transaction this was (by the sending key); they did it, so they are not told. */
  doer(): Promise<string | null> {
    this.doerId ??= this.e.txFrom
      ? this.one<{ id: string }>('SELECT id FROM users WHERE account = $1', [
          this.e.txFrom,
        ]).then((r) => r?.id ?? null)
      : Promise.resolve(null);
    return this.doerId;
  }

  /** To everyone listed except the doer. */
  async send(to: Iterable<string | null | undefined>, note: Omit<Note, 'key'>) {
    const doer = await this.doer();
    return this.writer.send(
      this.m,
      [...to].filter((id) => id !== doer),
      { ...note, key: this.key(note.kind) },
    );
  }

  role(roles: readonly Role[], except: Array<string | null> = []) {
    return this.writer.withRole(this.m, roles, except);
  }

  async one<T>(sql: string, params: unknown[]): Promise<T | undefined> {
    const rows: T[] = await this.m.query(sql, params);
    return rows[0];
  }

  many<T>(sql: string, params: unknown[]): Promise<T[]> {
    return this.m.query(sql, params);
  }

  /** A catalog entry's English and Bengali names, for wording in either language. */
  async named(table: 'produce_types' | 'input_types', code: string) {
    const row = await this.one<{ name: string; name_bn: string }>(
      `SELECT name, name_bn FROM ${table} WHERE code = $1`,
      [code],
    );
    return row
      ? { name: row.name, nameBn: row.name_bn }
      : { name: code, nameBn: null };
  }

  async project(id: string | null) {
    return id
      ? this.one<{ title: string; farmer_id: string }>(
          'SELECT title, farmer_id FROM projects WHERE id = $1',
          [id],
        )
      : undefined;
  }

  /** The farmer's field officer. */
  async officerOf(farmerId: string | null | undefined) {
    if (!farmerId) return null;
    const row = await this.one<{ field_officer_id: string | null }>(
      'SELECT field_officer_id FROM users WHERE id = $1',
      [farmerId],
    );
    return row?.field_officer_id ?? null;
  }

  /** A deal with its listing's seller side. */
  offer(e: ChainEvent) {
    return this.one<{
      buyer_id: string;
      receipt_id: string | null;
      farmer_id: string | null;
      seller_is_wegro: boolean;
      seller_id: string | null;
      project_id: string | null;
    }>(
      `SELECT o.buyer_id, l.receipt_id, l.farmer_id, l.seller_is_wegro, l.seller_id, l.project_id
         FROM offers o JOIN listings l ON l.id = o.listing_id WHERE o.id = $1`,
      [Number(e.args.offerId)],
    );
  }

  /** A bank's officers. */
  async bankOfficers(bankId: string | null): Promise<string[]> {
    if (!bankId) return [];
    const rows: Array<{ officer_id: string }> = await this.m.query(
      'SELECT officer_id FROM bank_officers WHERE bank_id = $1',
      [bankId],
    );
    return rows.map((r) => r.officer_id);
  }

  /** "Bank, Branch", or null if unknown. */
  async bankName(bankId: string | null): Promise<string | null> {
    const bank = bankId
      ? await this.one<{ name: string; branch_name: string }>(
          'SELECT name, branch_name FROM banks WHERE id = $1',
          [bankId],
        )
      : undefined;
    return bank ? `${bank.name}, ${bank.branch_name}` : null;
  }

  /** The seller side of a deal: the outside seller, or the farmer and their officer (none for WeGro's own). */
  async sellers(o: {
    project_id: string | null;
    seller_is_wegro: boolean;
    seller_id: string | null;
    farmer_id: string | null;
  }): Promise<Array<string | null>> {
    if (o.project_id === null) return [o.seller_id];
    if (o.seller_is_wegro) return [];
    return [o.farmer_id, await this.officerOf(o.farmer_id)];
  }

  /** Everyone holding confirmed slots in the project. */
  async holders(projectId: string): Promise<string[]> {
    const rows: Array<{ investor_id: string }> = await this.m.query(
      `SELECT DISTINCT investor_id FROM reservations WHERE project_id = $1 AND status = 'confirmed'`,
      [projectId],
    );
    return rows.map((r) => r.investor_id);
  }
}

const uuid = (v: unknown): string | null => {
  try {
    return typeof v === 'string' ? bytes32ToUuid(v) : null;
  } catch {
    return null;
  }
};
const code = (v: unknown) => {
  try {
    return bytes32ToCode(String(v));
  } catch {
    return '';
  }
};
const taka = (v: unknown) => poishaToTaka(BigInt(String(v)));
const ZERO = `0x${'0'.repeat(64)}`;
const date = (seconds: unknown) =>
  new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace('T', ' ');
/** A ledger time as ISO, for params: the app shows it in Bangladesh time. */
const isoTime = (seconds: unknown) =>
  new Date(Number(seconds) * 1000).toISOString();

/**
 * Turns ledger events into notifications: "action" for whoever must act
 * next, "outcome" for the people a record belongs to. Runs only for
 * transactions this backend sends, after they commit (never on replay).
 */
@Injectable()
export class NotificationRules implements OnModuleInit {
  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly writer: NotificationWriter,
  ) {}

  onModuleInit(): void {
    for (const [contract, events] of Object.entries(RULES) as Array<
      [ContractName, Record<string, Rule>]
    >) {
      for (const [name, rule] of Object.entries(events)) {
        this.handlers.onLive(contract, name, async (e, m) => {
          await rule(e, m, new Context(this.writer, m, e));
        });
      }
    }
  }
}

export const RULES: Partial<Record<ContractName, Record<string, Rule>>> = {
  AccessRegistry: {
    ParticipantRegistered: async (e, _m, x) => {
      const role = ROLE_BY_CHAIN_ID.get(String(e.args.role));
      if (!role) return;
      const id = uuid(e.args.participantId);
      // The super admin verifies staff; admins verify everyone else.
      const verifiers = STAFF_ROLES.has(role)
        ? [Role.SUPER_ADMIN]
        : [Role.ADMIN];
      await x.send(await x.role(verifiers), {
        category: ACTION,
        kind: NotificationKind.PARTICIPANT_REGISTERED,
        title: `New ${role.replace('_', ' ')} registration awaiting verification`,
        params: { role },
        subject: id ? { type: 'participant', id } : null,
      });
    },
    ParticipantStatusChanged: async (e, _m, x) => {
      const id = uuid(e.args.participantId);
      const status = Number(e.args.newStatus);
      if (status !== 2 && status !== 3) return;
      // Rejected after being verified: access revoked, not a registration turned down.
      const revoked = status === 3 && Number(e.args.previousStatus) === 2;
      await x.send([id], {
        category: OUTCOME,
        kind:
          status === 2
            ? NotificationKind.PARTICIPANT_VERIFIED
            : revoked
              ? NotificationKind.PARTICIPANT_ACCESS_REVOKED
              : NotificationKind.PARTICIPANT_REJECTED,
        title:
          status === 2
            ? 'Your account is verified'
            : revoked
              ? 'Your access to WeGro has been revoked'
              : 'Your registration was not accepted',
        params: {},
        subject: id ? { type: 'participant', id } : null,
      });
      // A farmer's field officer hears how their farmer's registration went.
      await x.send([await x.officerOf(id)], {
        category: OUTCOME,
        kind:
          status === 2
            ? NotificationKind.FARMER_VERIFIED
            : revoked
              ? NotificationKind.FARMER_ACCESS_REVOKED
              : NotificationKind.FARMER_REJECTED,
        title:
          status === 2
            ? 'A farmer of yours is verified'
            : revoked
              ? 'A farmer of yours lost access to WeGro'
              : "A farmer's registration was not accepted",
        params: {},
        subject: id ? { type: 'participant', id } : null,
      });
    },
    FieldOfficerAssigned: async (e, _m, x) => {
      const farmer = uuid(e.args.farmerId);
      await x.send([uuid(e.args.officerId)], {
        category: OUTCOME,
        kind: NotificationKind.FARMER_ASSIGNED,
        title: 'A farmer was assigned to you',
        params: {},
        subject: farmer ? { type: 'participant', id: farmer } : null,
      });
      await x.send([farmer], {
        category: OUTCOME,
        kind: NotificationKind.OFFICER_ASSIGNED,
        title: 'You have a new field officer',
        params: {},
        subject: farmer ? { type: 'participant', id: farmer } : null,
      });
    },
  },

  ProjectLedger: {
    SlotsReserved: async (e, _m, x) => {
      const p = await x.project(uuid(e.args.projectId));
      await x.send(await x.role([Role.ACCOUNTS]), {
        category: ACTION,
        kind: NotificationKind.RESERVATION_MADE,
        title: `Booking #${String(e.args.reservationId)} awaiting payment confirmation`,
        body: `${String(e.args.slots)} units in ${p?.title ?? 'a project'}; holds until ${date(e.args.expiresAt)} UTC`,
        params: {
          reservationId: String(e.args.reservationId),
          slots: Number(e.args.slots),
          project: p?.title ?? null,
          expiresAt: isoTime(e.args.expiresAt),
        },
        subject: { type: 'reservation', id: String(e.args.reservationId) },
      });
    },
    ReservationConfirmed: async (e, _m, x) => {
      const p = await x.project(uuid(e.args.projectId));
      await x.send([uuid(e.args.investorId)], {
        category: OUTCOME,
        kind: NotificationKind.RESERVATION_CONFIRMED,
        title: 'Payment confirmed: your units are issued',
        body: `${String(e.args.slots)} units in ${p?.title ?? 'the project'}`,
        params: { slots: Number(e.args.slots), project: p?.title ?? null },
        subject: { type: 'reservation', id: String(e.args.reservationId) },
      });
    },
    ReservationExpired: reservationClosed(
      NotificationKind.RESERVATION_EXPIRED,
      'Your booking lapsed unpaid',
    ),
    ReservationCancelled: reservationClosed(
      NotificationKind.RESERVATION_CANCELLED,
      'Your booking was cancelled',
    ),
    ProjectStageChanged: async (e, _m, x) => {
      const id = uuid(e.args.projectId);
      if (!id) return;
      const p = await x.project(id);
      if (!p) return;
      const subject = { type: 'project', id };
      const params = { project: p.title };
      const farmerSide = [p.farmer_id, await x.officerOf(p.farmer_id)];
      switch (Number(e.args.newStage)) {
        case 2: // OpenForFunding
          return x.send(farmerSide, {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_LIVE,
            params,
            title: `${p.title} is open for funding`,
            subject,
          });
        case 3: // Funded
          await x.send(await x.role([Role.OPERATIONS]), {
            category: ACTION,
            kind: NotificationKind.PROJECT_FUNDED,
            params,
            title: `${p.title} is fully funded: propose its input vouchers`,
            subject,
          });
          return x.send([...farmerSide, ...(await x.holders(id))], {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_FULLY_FUNDED,
            params,
            title: `${p.title} is fully funded`,
            subject,
          });
        case 4: // Active
          return x.send([...farmerSide, ...(await x.holders(id))], {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_ACTIVE,
            params,
            title: `${p.title} is active`,
            subject,
          });
        case 5: // ReadyForSale
          await x.send(await x.role([Role.ACCOUNTS]), {
            category: ACTION,
            kind: NotificationKind.PROJECT_READY_FOR_SALE,
            params,
            title: `${p.title} is ready for its final payout`,
            subject,
          });
          return x.send(await x.holders(id), {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_ON_SALE,
            params,
            title: `${p.title} is harvested and ready for sale`,
            subject,
          });
        case 6: // PaidOut
          return x.send([...farmerSide, ...(await x.holders(id))], {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_PAID_OUT,
            params,
            title: `${p.title} is paid out`,
            subject,
          });
        case 8: {
          // Cancelled
          await x.send(await x.holders(id), {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_CANCELLED,
            params,
            title: `${p.title} was cancelled: your money will be refunded`,
            subject,
          });
          await x.send(farmerSide, {
            category: OUTCOME,
            kind: NotificationKind.PROJECT_CALLED_OFF,
            params,
            title: `${p.title} was cancelled`,
            subject,
          });
          await x.send(await x.role([Role.ACCOUNTS]), {
            category: ACTION,
            kind: NotificationKind.PROJECT_REFUNDS_DUE,
            params: { project: p.title },
            title: `${p.title} was cancelled: refunds are due`,
            subject,
          });
          return;
        }
      }
    },
    RefundRecorded: async (e, _m, x) => {
      const id = uuid(e.args.projectId);
      const p = await x.project(id);
      await x.send([uuid(e.args.investorId)], {
        category: OUTCOME,
        kind: NotificationKind.REFUND_PAID,
        title: 'Your refund has been paid',
        body: p?.title,
        params: { project: p?.title ?? null },
        subject: id ? { type: 'project', id } : null,
      });
    },
  },

  VoucherRegistry: {
    VoucherProposed: async (e, _m, x) => {
      const p = await x.project(uuid(e.args.projectId));
      const input = await x.named('input_types', code(e.args.inputType));
      await x.send(await x.role([Role.ACCOUNTS]), {
        category: ACTION,
        kind: NotificationKind.VOUCHER_PROPOSED,
        title: 'Voucher awaiting approval',
        body: `${String(e.args.quantity)} ${code(e.args.inputType)} for ${p?.title ?? 'a project'}`,
        params: {
          quantity: String(e.args.quantity),
          input: input.name,
          inputBn: input.nameBn,
          project: p?.title ?? null,
        },
        subject: { type: 'voucher', id: uuid(e.args.voucherId) ?? '' },
      });
    },
    VoucherApproved: voucherDecided(NotificationKind.VOUCHER_APPROVED),
    VoucherRejected: voucherDecided(NotificationKind.VOUCHER_REJECTED),
    VoucherCancelled: voucherDecided(NotificationKind.VOUCHER_CANCELLED),
    SaleRecorded: async (e, _m, x) => {
      const v = await x.one<{ farmer_id: string }>(
        'SELECT farmer_id FROM vouchers WHERE id = $1',
        [uuid(e.args.voucherId)],
      );
      await x.send([await x.officerOf(v?.farmer_id)], {
        category: ACTION,
        kind: NotificationKind.SALE_RECORDED,
        title: `Confirm input sale #${String(e.args.saleId)}`,
        body: `${String(e.args.quantity)} units, ${taka(e.args.amount)} taka; unconfirmed sales lapse after 7 days`,
        params: {
          saleId: String(e.args.saleId),
          quantity: String(e.args.quantity),
          amount: taka(e.args.amount),
        },
        subject: { type: 'voucher-sale', id: String(e.args.saleId) },
      });
    },
    SaleConfirmed: saleClosed(NotificationKind.SALE_CONFIRMED, 'confirmed'),
    SaleCancelled: saleClosed(NotificationKind.SALE_CANCELLED, 'cancelled'),
    SaleExpired: saleClosed(NotificationKind.SALE_EXPIRED, 'expired'),
  },

  WarehouseReceipt: {
    ReceiptIssued: async (e, _m, x) => {
      const owner = uuid(e.args.owner);
      const produce = await x.named('produce_types', code(e.args.produceCode));
      await x.send([owner, await x.officerOf(owner)], {
        category: OUTCOME,
        kind: NotificationKind.RECEIPT_ISSUED,
        title: 'Warehouse receipt issued',
        body: `${String(e.args.quantity)} ${code(e.args.produceCode)} in storage`,
        params: {
          quantity: String(e.args.quantity),
          produce: produce.name,
          produceBn: produce.nameBn,
        },
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
    HandoverOffered: async (e, _m, x) => {
      await x.send(await x.role([Role.ADMIN]), {
        category: ACTION,
        kind: NotificationKind.HANDOVER_OFFERED,
        params: {},
        title: 'Buy-back offered: accept or decline the receipt',
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
    HandoverCancelled: async (e, _m, x) => {
      const r = await x.one<{ owner_id: string | null }>(
        'SELECT owner_id FROM warehouse_receipts WHERE id = $1',
        [String(e.args.receiptId)],
      );
      await x.send([await x.officerOf(r?.owner_id)], {
        category: OUTCOME,
        kind: NotificationKind.HANDOVER_CANCELLED,
        params: {},
        title: 'Buy-back offer withdrawn or declined',
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
    ExpiryExtended: receiptOutcome(
      NotificationKind.RECEIPT_EXTENDED,
      'Storage of your receipt was extended',
    ),
    ReceiptCollected: receiptOutcome(
      NotificationKind.RECEIPT_COLLECTED,
      'Goods on your receipt were collected',
    ),
    OperatorAssigned: async (e, _m, x) => {
      const site = uuid(e.args.siteId);
      if (!site) return; // taken off a site: their access ends with it
      const s = await x.one<{ name: string }>(
        'SELECT name FROM warehouse_sites WHERE id = $1',
        [site],
      );
      await x.send([uuid(e.args.operatorId)], {
        category: OUTCOME,
        kind: NotificationKind.SITE_ASSIGNED,
        title: `You were placed at ${s?.name ?? 'a warehouse site'}`,
        params: { site: s?.name ?? null },
        subject: { type: 'site', id: site },
      });
    },
    ReceiptTransferred: async (e, _m, x) => {
      // Only the buy-back: a buyer's part is covered by the deal's notices.
      if (e.args.to !== WEGRO_OWNER) return;
      const farmer = uuid(e.args.from);
      await x.send([farmer, await x.officerOf(farmer)], {
        category: OUTCOME,
        kind: NotificationKind.HANDOVER_ACCEPTED,
        params: {},
        title: 'WeGro accepted the buy-back',
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
  },

  TradeLedger: {
    ExternalListingCreated: async (e, _m, x) => {
      await x.send(await x.role([Role.ADMIN]), {
        category: ACTION,
        kind: NotificationKind.LISTING_AWAITING_APPROVAL,
        title: `Listing #${String(e.args.listingId)} by an outside seller awaits approval`,
        params: { listingId: String(e.args.listingId) },
        subject: { type: 'listing', id: String(e.args.listingId) },
      });
    },
    ListingApproved: listingOutcome(
      NotificationKind.LISTING_APPROVED,
      'Your listing is live',
    ),
    ListingRejected: listingOutcome(
      NotificationKind.LISTING_REJECTED,
      'Your listing was turned down',
    ),
    SellerPaid: async (e, _m, x) => {
      await x.send([uuid(e.args.seller)], {
        category: OUTCOME,
        kind: NotificationKind.SELLER_PAID,
        title: `You were paid for deal #${String(e.args.offerId)}`,
        body: `${taka(e.args.amount)} taka`,
        params: {
          offerId: String(e.args.offerId),
          amount: taka(e.args.amount),
        },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
    OfferMade: async (e, _m, x) => {
      // On an outside seller's listing the seller decides; otherwise WeGro's admins.
      const l = await x.one<{
        seller_id: string | null;
        project_id: string | null;
      }>('SELECT seller_id, project_id FROM listings WHERE id = $1', [
        Number(e.args.listingId),
      ]);
      const deciders =
        l && l.project_id === null ? [l.seller_id] : await x.role([Role.ADMIN]);
      await x.send(deciders, {
        category: ACTION,
        kind: NotificationKind.OFFER_MADE,
        title: `Offer #${String(e.args.offerId)} awaiting approval`,
        body: `${String(e.args.quantity)} at ${taka(e.args.unitPrice)} taka on listing #${String(e.args.listingId)}`,
        params: {
          offerId: String(e.args.offerId),
          quantity: String(e.args.quantity),
          unitPrice: taka(e.args.unitPrice),
          listingId: String(e.args.listingId),
        },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
    OfferWithdrawn: async (e, _m, x) => {
      const l = await x.one<{
        seller_id: string | null;
        project_id: string | null;
      }>(
        `SELECT l.seller_id, l.project_id FROM offers o JOIN listings l ON l.id = o.listing_id
          WHERE o.id = $1`,
        [Number(e.args.offerId)],
      );
      const deciders =
        l && l.project_id === null ? [l.seller_id] : await x.role([Role.ADMIN]);
      await x.send(deciders, {
        category: OUTCOME,
        kind: NotificationKind.OFFER_WITHDRAWN,
        title: `Offer #${String(e.args.offerId)} was withdrawn by the buyer`,
        params: { offerId: String(e.args.offerId) },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
    OfferApproved: async (e, _m, x) => {
      const o = await x.offer(e);
      await x.send([o?.buyer_id], {
        category: OUTCOME,
        kind: NotificationKind.OFFER_APPROVED,
        title: 'Your offer was approved',
        body: `Pay by ${date(e.args.paymentDueAt)} UTC, or the deal lapses`,
        params: { paymentDueAt: isoTime(e.args.paymentDueAt) },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
      await x.send(await x.role([Role.ACCOUNTS]), {
        category: ACTION,
        kind: NotificationKind.DEAL_AWAITING_PAYMENT,
        title: `Deal #${String(e.args.offerId)}: confirm the buyer's payment when it arrives`,
        params: { offerId: String(e.args.offerId) },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
      // The farmer's side of an offer on their produce (an outside seller approved it themselves).
      if (o && o.project_id !== null) {
        await x.send(await x.sellers(o), {
          category: OUTCOME,
          kind: NotificationKind.DEAL_AGREED,
          title: `Offer #${String(e.args.offerId)} on your produce was approved: awaiting the buyer's payment`,
          params: { offerId: String(e.args.offerId) },
          subject: { type: 'offer', id: String(e.args.offerId) },
        });
      }
    },
    OfferRejected: offerOutcome(
      NotificationKind.OFFER_REJECTED,
      'Your offer was rejected',
    ),
    DealCancelled: offerOutcome(
      NotificationKind.DEAL_CANCELLED,
      'Your deal was cancelled',
      true,
    ),
    DealExpired: offerOutcome(
      NotificationKind.DEAL_EXPIRED,
      'Your deal lapsed: payment was not confirmed in time',
      true,
    ),
    BuyerPaymentConfirmed: async (e, m, x) => {
      const o = await x.offer(e);
      if (!o) return;
      const subject = { type: 'offer', id: String(e.args.offerId) };
      await x.send([o.buyer_id], {
        category: OUTCOME,
        kind: NotificationKind.DEAL_PAID,
        params: {},
        title: 'Your payment is confirmed',
        subject,
      });
      // Whoever hands the goods over: the outside seller, the site's operators, or the farmer's officer.
      const handlers: Array<{ operator_id: string }> = o.receipt_id
        ? await m.query(
            `SELECT w.operator_id FROM warehouse_receipts r
               JOIN warehouse_operators w ON w.site_id = r.site_id WHERE r.id = $1`,
            [o.receipt_id],
          )
        : [];
      const deliverers =
        o.project_id === null
          ? [o.seller_id]
          : o.receipt_id
            ? handlers.map((h) => h.operator_id)
            : [await x.officerOf(o.farmer_id!)];
      await x.send(deliverers, {
        category: ACTION,
        kind: NotificationKind.DEAL_DELIVER,
        title: `Deal #${String(e.args.offerId)} is paid: hand over and confirm delivery`,
        params: { offerId: String(e.args.offerId) },
        subject,
      });
      // The farmer's side hears of the payment, unless already asked to deliver.
      if (o.project_id !== null) {
        await x.send(
          (await x.sellers(o)).filter((id) => !deliverers.includes(id)),
          {
            category: OUTCOME,
            kind: NotificationKind.DEAL_BUYER_PAID,
            title: `The buyer paid for deal #${String(e.args.offerId)}`,
            params: { offerId: String(e.args.offerId) },
            subject,
          },
        );
      }
    },
    DeliveryConfirmed: async (e, _m, x) => {
      const o = await x.one<{ quantity: string }>(
        'SELECT quantity::text AS quantity FROM offers WHERE id = $1',
        [Number(e.args.offerId)],
      );
      if (!o || BigInt(o.quantity) === BigInt(String(e.args.quantity))) return;
      await x.send(await x.role([Role.ADMIN]), {
        category: ACTION,
        kind: NotificationKind.DELIVERY_MISMATCH,
        title: `Deal #${String(e.args.offerId)}: the ${e.args.isBuyer ? 'buyer' : 'handler'} confirmed ${String(e.args.quantity)}, not ${o.quantity}`,
        params: {
          offerId: String(e.args.offerId),
          buyer: Boolean(e.args.isBuyer),
          confirmed: String(e.args.quantity),
          quantity: o.quantity,
        },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
    RequestPosted: async (e, _m, x) => {
      const produce = await x.named('produce_types', code(e.args.produceCode));
      await x.send(await x.role([Role.ADMIN, Role.OPERATIONS]), {
        category: ACTION,
        kind: NotificationKind.REQUEST_POSTED,
        title: `A buyer wants ${String(e.args.quantity)} ${produce.name}`,
        params: {
          requestId: String(e.args.requestId),
          quantity: String(e.args.quantity),
          produce: produce.name,
          produceBn: produce.nameBn,
          maxUnitPrice: taka(e.args.maxUnitPrice),
        },
        subject: { type: 'request', id: String(e.args.requestId) },
      });
    },
    DealDelivered: async (e, _m, x) => {
      const o = await x.offer(e);
      if (!o) return;
      const sellers =
        o.project_id === null
          ? [o.seller_id]
          : o.seller_is_wegro
            ? await x.role([Role.ADMIN])
            : [o.farmer_id, await x.officerOf(o.farmer_id!)];
      await x.send([o.buyer_id, ...sellers], {
        category: OUTCOME,
        kind: NotificationKind.DEAL_DELIVERED,
        title: `Deal #${String(e.args.offerId)} delivered`,
        body: `${taka(e.args.amount)} taka`,
        params: {
          offerId: String(e.args.offerId),
          amount: taka(e.args.amount),
        },
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
      if (o.project_id === null) {
        await x.send(await x.role([Role.ACCOUNTS]), {
          category: ACTION,
          kind: NotificationKind.SELLER_PAYOUT_DUE,
          title: `Deal #${String(e.args.offerId)} delivered: pay the seller`,
          params: { offerId: String(e.args.offerId) },
          subject: { type: 'offer', id: String(e.args.offerId) },
        });
      }
    },
  },

  InsuranceRegistry: {
    WeatherEventRecorded: async (e, _m, x) => {
      const district = code(e.args.regionCode);
      const type = code(e.args.eventType);
      // Officers of farmers whose insured crop in the district is in the field
      // and whose current cover pays for this kind of event.
      const officers: Array<{ officer_id: string }> = await x.many(
        `SELECT DISTINCT u.field_officer_id AS officer_id
           FROM projects p JOIN users u ON u.id = p.farmer_id
          WHERE p.district_code = $1 AND p.insured AND p.stage IN ('funded', 'active')
            AND u.field_officer_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM (
                SELECT c.covered_event_types FROM coverage_terms c
                 WHERE c.project_id = p.id AND c.status = 'recorded'
                   AND c.insurer_id = (
                     SELECT a.insurer_id FROM insurer_assignments a
                      WHERE a.project_id = p.id AND a.status = 'recorded'
                      ORDER BY a.chain_event_block DESC, a.chain_event_log DESC LIMIT 1)
                 ORDER BY c.chain_event_block DESC, c.chain_event_log DESC LIMIT 1) l
              WHERE $2 = ANY(l.covered_event_types))`,
        [district, type],
      );
      const t = await x.one<{ name: string; name_bn: string }>(
        'SELECT name, name_bn FROM weather_event_types WHERE code = $1',
        [type],
      );
      await x.send(
        officers.map((o) => o.officer_id),
        {
          category: ACTION,
          kind: NotificationKind.WEATHER_RECORDED,
          title: `${t?.name ?? type} recorded in ${district}: check your farmers' insured crops`,
          params: {
            event: t?.name ?? type,
            eventBn: t?.name_bn ?? null,
            district,
          },
          subject: { type: 'weather-event', id: uuid(e.args.eventId) ?? '' },
        },
      );
    },
    InsurerAssigned: async (e, _m, x) => {
      const projectId = uuid(e.args.projectId);
      if (!projectId) return;
      const p = await x.project(projectId);
      await x.send([uuid(e.args.insurerId)], {
        category: ACTION,
        kind: NotificationKind.INSURER_ASSIGNED,
        title: `You were assigned to insure ${p?.title ?? 'a project'}: set its cover`,
        params: { project: p?.title ?? null },
        subject: { type: 'insured-project', id: projectId },
      });
    },
    ClaimOpened: async (e, _m, x) => {
      // The project's insurer: its latest recorded assignment.
      const insurer = await x.one<{ insurer_id: string }>(
        `SELECT insurer_id FROM insurer_assignments WHERE project_id = $1 AND status = 'recorded'
          ORDER BY chain_event_block DESC, chain_event_log DESC LIMIT 1`,
        [uuid(e.args.projectId)],
      );
      await x.send([insurer?.insurer_id], {
        category: ACTION,
        kind: NotificationKind.CLAIM_OPENED,
        params: {},
        title: 'A claim was opened on a project you cover',
        subject: { type: 'claim', id: uuid(e.args.claimId) ?? '' },
      });
      const p = await x.project(uuid(e.args.projectId));
      await x.send([p?.farmer_id, await x.officerOf(p?.farmer_id)], {
        category: OUTCOME,
        kind: NotificationKind.CLAIM_FILED,
        params: { project: p?.title ?? null },
        title: `An insurance claim was opened on ${p?.title ?? 'a project'}`,
        subject: { type: 'claim', id: uuid(e.args.claimId) ?? '' },
      });
    },
    ClaimStatusChanged: async (e, _m, x) => {
      const status = Number(e.args.status);
      if (status !== 3 && status !== 4) return;
      const c = await x.one<{ opened_by_id: string; project_id: string }>(
        'SELECT opened_by_id, project_id FROM insurance_claims WHERE id = $1',
        [uuid(e.args.claimId)],
      );
      if (!c) return;
      const p = await x.project(c.project_id);
      await x.send(
        [c.opened_by_id, p?.farmer_id, await x.officerOf(p?.farmer_id)],
        {
          category: OUTCOME,
          kind:
            status === 3
              ? NotificationKind.CLAIM_APPROVED
              : NotificationKind.CLAIM_REJECTED,
          title:
            status === 3
              ? `Insurance claim approved: ${taka(e.args.approvedAmount)} taka`
              : 'Insurance claim rejected',
          body: p?.title,
          params:
            status === 3
              ? {
                  amount: taka(e.args.approvedAmount),
                  project: p?.title ?? null,
                }
              : { project: p?.title ?? null },
          subject: { type: 'claim', id: uuid(e.args.claimId) ?? '' },
        },
      );
      if (status === 3) {
        await x.send(await x.role([Role.ACCOUNTS]), {
          category: ACTION,
          kind: NotificationKind.CLAIM_PAYMENT_DUE,
          title: `Insurance claim approved: record the insurer's payment of ${taka(e.args.approvedAmount)} taka`,
          body: p?.title,
          params: {
            amount: taka(e.args.approvedAmount),
            project: p?.title ?? null,
          },
          subject: { type: 'claim', id: uuid(e.args.claimId) ?? '' },
        });
      }
    },
    ClaimPaid: async (e, _m, x) => {
      const c = await x.one<{ opened_by_id: string; project_id: string }>(
        'SELECT opened_by_id, project_id FROM insurance_claims WHERE id = $1',
        [uuid(e.args.claimId)],
      );
      if (!c) return;
      const p = await x.project(c.project_id);
      await x.send(
        [c.opened_by_id, p?.farmer_id, await x.officerOf(p?.farmer_id)],
        {
          category: OUTCOME,
          kind: NotificationKind.CLAIM_PAID,
          title: `The insurer paid the claim: ${taka(e.args.amount)} taka`,
          body: p?.title,
          params: { amount: taka(e.args.amount), project: p?.title ?? null },
          subject: { type: 'claim', id: uuid(e.args.claimId) ?? '' },
        },
      );
    },
  },

  SettlementLedger: {
    RoundPrepared: async (e, _m, x) => {
      const preparer = uuid(e.args.preparedBy);
      await x.send(await x.role([Role.ACCOUNTS], [preparer]), {
        category: ACTION,
        kind: NotificationKind.ROUND_PREPARED,
        params: { roundId: String(e.args.roundId) },
        title: `Payout round #${String(e.args.roundId)} needs a second approval`,
        subject: { type: 'round', id: String(e.args.roundId) },
      });
    },
    RoundRejected: async (e, _m, x) => {
      const r = await x.one<{ prepared_by_id: string }>(
        'SELECT prepared_by_id FROM settlement_rounds WHERE id = $1',
        [Number(e.args.roundId)],
      );
      await x.send([r?.prepared_by_id], {
        category: OUTCOME,
        kind: NotificationKind.ROUND_REJECTED,
        params: { roundId: String(e.args.roundId) },
        title: `Payout round #${String(e.args.roundId)} was sent back`,
        subject: { type: 'round', id: String(e.args.roundId) },
      });
    },
    RoundApproved: async (e, _m, x) => {
      await x.send(await x.role([Role.ACCOUNTS]), {
        category: ACTION,
        kind: NotificationKind.ROUND_APPROVED,
        params: { roundId: String(e.args.roundId) },
        title: `Payout round #${String(e.args.roundId)} approved: pay and record each line`,
        subject: { type: 'round', id: String(e.args.roundId) },
      });
    },
    PaymentRecorded: async (e, _m, x) => {
      const payee = uuid(e.args.payeeId);
      const line = await x.one<{ amount: string | null }>(
        'SELECT amount::text AS amount FROM payout_lines WHERE round_id = $1 AND payee_id = $2',
        [Number(e.args.roundId), payee],
      );
      await x.send([payee], {
        category: OUTCOME,
        kind: NotificationKind.PAYOUT_PAID,
        params: { amount: line?.amount ? taka(line.amount) : null },
        title: line?.amount
          ? `You were paid ${taka(line.amount)} taka`
          : 'A payout to you was paid',
        subject: { type: 'round', id: String(e.args.roundId) },
      });
      await x.send([await x.officerOf(payee)], {
        category: OUTCOME,
        kind: NotificationKind.PAYOUT_FARMER_PAID,
        params: { amount: line?.amount ? taka(line.amount) : null },
        title: line?.amount
          ? `A farmer of yours was paid ${taka(line.amount)} taka`
          : 'A farmer of yours was paid',
        subject: { type: 'round', id: String(e.args.roundId) },
      });
    },
  },

  ConsentRegistry: {
    TrackRecordPublished: async (e, _m, x) => {
      const farmer = uuid(e.args.farmerId);
      await x.send([farmer], {
        category: OUTCOME,
        kind: NotificationKind.TRACK_RECORD_PUBLISHED,
        params: { version: Number(e.args.version) },
        title: `Your track record version ${String(e.args.version)} was published`,
        subject: { type: 'track-record', id: farmer ?? '' },
      });
      // Officers of banks whose permission is current see the new version from now on.
      const officers: Array<{ officer_id: string }> = await x.many(
        `SELECT DISTINCT o.officer_id FROM bank_consents c
           JOIN bank_officers o ON o.bank_id = c.bank_id
          WHERE c.farmer_id = $1 AND c.status = 'active' AND c.expires_at > $2`,
        [farmer, e.blockTime],
      );
      await x.send(
        officers.map((o) => o.officer_id),
        {
          category: OUTCOME,
          kind: NotificationKind.TRACK_RECORD_UPDATED,
          params: { version: Number(e.args.version) },
          title: `A farmer's track record has a new version (${String(e.args.version)})`,
          subject: { type: 'bank-farmer', id: farmer ?? '' },
        },
      );
    },
    ConsentGranted: consentNotice(
      NotificationKind.CONSENT_GRANTED,
      'gave permission to',
      NotificationKind.CONSENT_BANK_GRANTED,
    ),
    ConsentRevoked: consentNotice(
      NotificationKind.CONSENT_REVOKED,
      'withdrew permission from',
      NotificationKind.CONSENT_BANK_REVOKED,
    ),
    BankOfficerAssigned: async (e, _m, x) => {
      const bank = e.args.bankId === ZERO ? null : uuid(e.args.bankId);
      const name = await x.bankName(bank);
      await x.send([uuid(e.args.officerId)], {
        category: OUTCOME,
        kind: bank
          ? NotificationKind.BANK_OFFICER_ASSIGNED
          : NotificationKind.BANK_OFFICER_REMOVED,
        title: bank
          ? `You were placed at ${name ?? 'a bank'}`
          : 'You were taken off your bank',
        params: { bank: name },
        subject: bank ? { type: 'bank', id: bank } : null,
      });
    },
    SummaryViewed: consentNotice(
      NotificationKind.TRACK_RECORD_VIEWED,
      'was viewed by',
    ),
  },
};

// --- Shared rule shapes ---

function reservationClosed(kind: NotificationKind, title: string): Rule {
  return async (e, _m, x) => {
    const r = await x.one<{ investor_id: string }>(
      'SELECT investor_id FROM reservations WHERE id = $1',
      [Number(e.args.reservationId)],
    );
    await x.send([r?.investor_id], {
      category: OUTCOME,
      kind,
      title,
      params: {},
      subject: { type: 'reservation', id: String(e.args.reservationId) },
    });
  };
}

function voucherDecided(
  kind:
    | NotificationKind.VOUCHER_APPROVED
    | NotificationKind.VOUCHER_REJECTED
    | NotificationKind.VOUCHER_CANCELLED,
): Rule {
  const status = kind.slice('voucher.'.length);
  return async (e, _m, x) => {
    const v = await x.one<{
      proposed_by_id: string;
      farmer_id: string;
      quantity: string;
      input_type_code: string;
    }>(
      'SELECT proposed_by_id, farmer_id, quantity, input_type_code FROM vouchers WHERE id = $1',
      [uuid(e.args.voucherId)],
    );
    if (!v) return;
    const to =
      kind === NotificationKind.VOUCHER_REJECTED
        ? [v.proposed_by_id]
        : [v.proposed_by_id, v.farmer_id, await x.officerOf(v.farmer_id)];
    const input = await x.named('input_types', v.input_type_code);
    await x.send(to, {
      category: OUTCOME,
      kind,
      title: `Voucher ${status}: ${v.quantity} ${v.input_type_code}`,
      params: {
        quantity: v.quantity,
        input: input.name,
        inputBn: input.nameBn,
      },
      subject: { type: 'voucher', id: uuid(e.args.voucherId) ?? '' },
    });
  };
}

function saleClosed(kind: NotificationKind, status: string): Rule {
  return async (e, _m, x) => {
    const s = await x.one<{ supplier_id: string }>(
      'SELECT supplier_id FROM voucher_sales WHERE id = $1',
      [Number(e.args.saleId)],
    );
    await x.send([s?.supplier_id], {
      category: OUTCOME,
      kind,
      title: `Input sale #${String(e.args.saleId)} ${status}`,
      params: { saleId: String(e.args.saleId) },
      subject: { type: 'voucher-sale', id: String(e.args.saleId) },
    });
  };
}

/** To an outside seller about their listing. */
function listingOutcome(kind: NotificationKind, title: string): Rule {
  return async (e, _m, x) => {
    const l = await x.one<{ seller_id: string | null }>(
      'SELECT seller_id FROM listings WHERE id = $1',
      [Number(e.args.listingId)],
    );
    await x.send([l?.seller_id], {
      category: OUTCOME,
      kind,
      title,
      params: { listingId: String(e.args.listingId) },
      subject: { type: 'listing', id: String(e.args.listingId) },
    });
  };
}

/** To the buyer and, when `sellerToo`, the seller side of the deal. */
function offerOutcome(
  kind: NotificationKind,
  title: string,
  sellerToo = false,
): Rule {
  return async (e, _m, x) => {
    const o = await x.offer(e);
    const sellers = o && sellerToo ? await x.sellers(o) : [];
    await x.send([o?.buyer_id, ...sellers], {
      category: OUTCOME,
      kind,
      title,
      params: { offerId: String(e.args.offerId) },
      subject: { type: 'offer', id: String(e.args.offerId) },
    });
  };
}

/** To the farmer; with `bankKind`, also to the bank's officers. */
function consentNotice(
  kind: NotificationKind,
  verb: string,
  bankKind?: NotificationKind,
): Rule {
  return async (e, _m, x) => {
    const bankId = uuid(e.args.bankId);
    const bankName = (await x.bankName(bankId)) ?? 'a bank';
    const farmer = uuid(e.args.farmerId);
    if (bankKind) {
      await x.send(await x.bankOfficers(bankId), {
        category: OUTCOME,
        kind: bankKind,
        title:
          bankKind === NotificationKind.CONSENT_BANK_GRANTED
            ? `A farmer gave ${bankName} permission to see their track record`
            : `A farmer withdrew ${bankName}'s permission to see their track record`,
        params: { bank: bankName },
        subject: farmer ? { type: 'bank-farmer', id: farmer } : null,
      });
    }
    await x.send([farmer], {
      category: OUTCOME,
      kind,
      title:
        kind === NotificationKind.TRACK_RECORD_VIEWED
          ? `Your track record ${verb} ${bankName}`
          : `You ${verb} ${bankName}`,
      params: { bank: bankName },
      subject: farmer ? { type: 'track-record', id: farmer } : null,
    });
  };
}

/** To a receipt's owner (a farmer or an outside party) and the farmer's officer. */
function receiptOutcome(kind: NotificationKind, title: string): Rule {
  return async (e, _m, x) => {
    const r = await x.one<{ owner_id: string | null }>(
      'SELECT owner_id FROM warehouse_receipts WHERE id = $1',
      [String(e.args.receiptId)],
    );
    await x.send([r?.owner_id, await x.officerOf(r?.owner_id)], {
      category: OUTCOME,
      kind,
      title,
      params: {},
      subject: { type: 'receipt', id: String(e.args.receiptId) },
    });
  };
}
