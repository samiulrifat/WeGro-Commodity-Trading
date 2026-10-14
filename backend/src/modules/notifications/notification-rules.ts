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
import { NotificationCategory } from './notification.enums';

const { Action, Outcome } = NotificationCategory;

type Rule = (e: ChainEvent, m: EntityManager, ctx: Context) => Promise<unknown>;

/** What every rule needs: the writer, lookups, and a per-event dedupe key. */
class Context {
  constructor(
    private readonly writer: NotificationWriter,
    private readonly m: EntityManager,
    private readonly e: ChainEvent,
  ) {}

  /** Occasion key: this event, this kind of notice. */
  key(kind: string): string {
    return `ev:${this.e.blockNumber}:${this.e.logIndex}:${kind}`;
  }

  send(to: Iterable<string | null | undefined>, note: Omit<Note, 'key'>) {
    return this.writer.send(this.m, to, { ...note, key: this.key(note.kind) });
  }

  role(roles: readonly Role[], except: Array<string | null> = []) {
    return this.writer.withRole(this.m, roles, except);
  }

  async one<T>(sql: string, params: unknown[]): Promise<T | undefined> {
    const rows: T[] = await this.m.query(sql, params);
    return rows[0];
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
      farmer_id: string;
      seller_is_wegro: boolean;
    }>(
      `SELECT o.buyer_id, l.receipt_id, l.farmer_id, l.seller_is_wegro
         FROM offers o JOIN listings l ON l.id = o.listing_id WHERE o.id = $1`,
      [Number(e.args.offerId)],
    );
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
const date = (seconds: unknown) =>
  new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace('T', ' ');

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
        ? [Role.SuperAdmin]
        : [Role.Admin];
      await x.send(await x.role(verifiers), {
        category: Action,
        kind: 'participant.registered',
        title: `New ${role.replace('_', ' ')} registration awaiting verification`,
        subject: id ? { type: 'participant', id } : null,
      });
    },
    ParticipantStatusChanged: async (e, _m, x) => {
      const id = uuid(e.args.participantId);
      const status = Number(e.args.newStatus);
      if (status !== 2 && status !== 3) return;
      await x.send([id], {
        category: Outcome,
        kind: status === 2 ? 'participant.verified' : 'participant.rejected',
        title:
          status === 2
            ? 'Your account is verified'
            : 'Your registration was not accepted',
        subject: id ? { type: 'participant', id } : null,
      });
    },
    FieldOfficerAssigned: async (e, _m, x) => {
      const farmer = uuid(e.args.farmerId);
      await x.send([uuid(e.args.officerId)], {
        category: Outcome,
        kind: 'farmer.assigned',
        title: 'A farmer was assigned to you',
        subject: farmer ? { type: 'participant', id: farmer } : null,
      });
    },
  },

  ProjectLedger: {
    SlotsReserved: async (e, _m, x) => {
      const p = await x.project(uuid(e.args.projectId));
      await x.send(await x.role([Role.Accounts]), {
        category: Action,
        kind: 'reservation.made',
        title: `Reservation #${String(e.args.reservationId)} awaiting payment confirmation`,
        body: `${String(e.args.slots)} slots in ${p?.title ?? 'a project'}; holds until ${date(e.args.expiresAt)} UTC`,
        subject: { type: 'reservation', id: String(e.args.reservationId) },
      });
    },
    ReservationConfirmed: async (e, _m, x) => {
      const p = await x.project(uuid(e.args.projectId));
      await x.send([uuid(e.args.investorId)], {
        category: Outcome,
        kind: 'reservation.confirmed',
        title: 'Payment confirmed: your slots are issued',
        body: `${String(e.args.slots)} slots in ${p?.title ?? 'the project'}`,
        subject: { type: 'reservation', id: String(e.args.reservationId) },
      });
    },
    ReservationExpired: reservationClosed(
      'expired',
      'Your reservation expired unpaid',
    ),
    ReservationCancelled: reservationClosed(
      'cancelled',
      'Your reservation was cancelled',
    ),
    ProjectStageChanged: async (e, _m, x) => {
      const id = uuid(e.args.projectId);
      if (!id) return;
      const p = await x.project(id);
      if (!p) return;
      const subject = { type: 'project', id };
      switch (Number(e.args.newStage)) {
        case 3: // Funded
          return x.send(await x.role([Role.Operations]), {
            category: Action,
            kind: 'project.funded',
            title: `${p.title} is fully funded: propose its input vouchers`,
            subject,
          });
        case 4: // Active
          return x.send([p.farmer_id, await x.officerOf(p.farmer_id)], {
            category: Outcome,
            kind: 'project.active',
            title: `${p.title} is active`,
            subject,
          });
        case 5: // ReadyForSale
          return x.send(await x.role([Role.Accounts]), {
            category: Action,
            kind: 'project.ready-for-sale',
            title: `${p.title} is ready for its final payout`,
            subject,
          });
        case 6: // PaidOut
          return x.send([p.farmer_id, ...(await x.holders(id))], {
            category: Outcome,
            kind: 'project.paid-out',
            title: `${p.title} is paid out`,
            subject,
          });
        case 8: {
          // Cancelled
          await x.send(await x.holders(id), {
            category: Outcome,
            kind: 'project.cancelled',
            title: `${p.title} was cancelled: your money will be refunded`,
            subject,
          });
          await x.send(await x.role([Role.Accounts]), {
            category: Action,
            kind: 'project.refunds-due',
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
        category: Outcome,
        kind: 'refund.paid',
        title: 'Your refund has been paid',
        body: p?.title,
        subject: id ? { type: 'project', id } : null,
      });
    },
  },

  VoucherRegistry: {
    VoucherProposed: async (e, _m, x) => {
      const p = await x.project(uuid(e.args.projectId));
      await x.send(await x.role([Role.Accounts]), {
        category: Action,
        kind: 'voucher.proposed',
        title: 'Voucher awaiting approval',
        body: `${String(e.args.quantity)} ${code(e.args.inputType)} for ${p?.title ?? 'a project'}`,
        subject: { type: 'voucher', id: uuid(e.args.voucherId) ?? '' },
      });
    },
    VoucherApproved: voucherDecided('approved'),
    VoucherRejected: voucherDecided('rejected'),
    VoucherCancelled: voucherDecided('cancelled'),
    SaleRecorded: async (e, _m, x) => {
      const v = await x.one<{ farmer_id: string }>(
        'SELECT farmer_id FROM vouchers WHERE id = $1',
        [uuid(e.args.voucherId)],
      );
      await x.send([await x.officerOf(v?.farmer_id)], {
        category: Action,
        kind: 'sale.recorded',
        title: `Confirm input sale #${String(e.args.saleId)}`,
        body: `${String(e.args.quantity)} units, ${taka(e.args.amount)} taka; unconfirmed sales lapse after 7 days`,
        subject: { type: 'voucher-sale', id: String(e.args.saleId) },
      });
    },
    SaleConfirmed: saleClosed('confirmed'),
    SaleCancelled: saleClosed('cancelled'),
    SaleExpired: saleClosed('expired'),
  },

  WarehouseReceipt: {
    ReceiptIssued: async (e, _m, x) => {
      const owner = uuid(e.args.owner);
      await x.send([owner, await x.officerOf(owner)], {
        category: Outcome,
        kind: 'receipt.issued',
        title: 'Warehouse receipt issued',
        body: `${String(e.args.quantity)} ${code(e.args.produceCode)} in storage`,
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
    HandoverOffered: async (e, _m, x) => {
      await x.send(await x.role([Role.Admin]), {
        category: Action,
        kind: 'handover.offered',
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
        category: Outcome,
        kind: 'handover.cancelled',
        title: 'Buy-back offer withdrawn or declined',
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
    ReceiptTransferred: async (e, _m, x) => {
      // Only the buy-back: a buyer's part is covered by the deal's notices.
      if (e.args.to !== WEGRO_OWNER) return;
      const farmer = uuid(e.args.from);
      await x.send([farmer, await x.officerOf(farmer)], {
        category: Outcome,
        kind: 'handover.accepted',
        title: 'WeGro accepted the buy-back',
        subject: { type: 'receipt', id: String(e.args.receiptId) },
      });
    },
  },

  TradeLedger: {
    OfferMade: async (e, _m, x) => {
      await x.send(await x.role([Role.Admin]), {
        category: Action,
        kind: 'offer.made',
        title: `Offer #${String(e.args.offerId)} awaiting approval`,
        body: `${String(e.args.quantity)} at ${taka(e.args.unitPrice)} taka on listing #${String(e.args.listingId)}`,
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
    OfferApproved: async (e, _m, x) => {
      const o = await x.offer(e);
      await x.send([o?.buyer_id], {
        category: Outcome,
        kind: 'offer.approved',
        title: 'Your offer was approved',
        body: `Pay by ${date(e.args.paymentDueAt)} UTC, or the deal lapses`,
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
      await x.send(await x.role([Role.Accounts]), {
        category: Action,
        kind: 'deal.payment-due',
        title: `Deal #${String(e.args.offerId)}: confirm the buyer's payment when it arrives`,
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
    OfferRejected: offerOutcome('offer.rejected', 'Your offer was rejected'),
    DealCancelled: offerOutcome('deal.cancelled', 'Your deal was cancelled'),
    DealExpired: offerOutcome(
      'deal.expired',
      'Your deal lapsed: payment was not confirmed in time',
    ),
    BuyerPaymentConfirmed: async (e, m, x) => {
      const o = await x.offer(e);
      if (!o) return;
      const subject = { type: 'offer', id: String(e.args.offerId) };
      await x.send([o.buyer_id], {
        category: Outcome,
        kind: 'deal.paid',
        title: 'Your payment is confirmed',
        subject,
      });
      // Whoever hands the goods over: the site's operators, or the farmer's officer.
      const handlers: Array<{ operator_id: string }> = o.receipt_id
        ? await m.query(
            `SELECT w.operator_id FROM warehouse_receipts r
               JOIN warehouse_operators w ON w.site_id = r.site_id WHERE r.id = $1`,
            [o.receipt_id],
          )
        : [];
      await x.send(
        o.receipt_id
          ? handlers.map((h) => h.operator_id)
          : [await x.officerOf(o.farmer_id)],
        {
          category: Action,
          kind: 'deal.deliver',
          title: `Deal #${String(e.args.offerId)} is paid: hand over and confirm delivery`,
          subject,
        },
      );
    },
    DealDelivered: async (e, _m, x) => {
      const o = await x.offer(e);
      if (!o) return;
      const sellers = o.seller_is_wegro
        ? await x.role([Role.Admin])
        : [o.farmer_id, await x.officerOf(o.farmer_id)];
      await x.send([o.buyer_id, ...sellers], {
        category: Outcome,
        kind: 'deal.delivered',
        title: `Deal #${String(e.args.offerId)} delivered`,
        body: `${taka(e.args.amount)} taka`,
        subject: { type: 'offer', id: String(e.args.offerId) },
      });
    },
  },

  InsuranceRegistry: {
    ClaimOpened: async (e, _m, x) => {
      const insurer = await x.one<{ insurer_id: string }>(
        `SELECT insurer_id FROM coverage_terms WHERE project_id = $1 AND status = 'recorded' LIMIT 1`,
        [uuid(e.args.projectId)],
      );
      await x.send([insurer?.insurer_id], {
        category: Action,
        kind: 'claim.opened',
        title: 'A claim was opened on a project you cover',
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
      await x.send([c.opened_by_id, p?.farmer_id], {
        category: Outcome,
        kind: status === 3 ? 'claim.approved' : 'claim.rejected',
        title:
          status === 3
            ? `Insurance claim approved: ${taka(e.args.approvedAmount)} taka`
            : 'Insurance claim rejected',
        body: p?.title,
        subject: { type: 'claim', id: uuid(e.args.claimId) ?? '' },
      });
    },
  },

  SettlementLedger: {
    RoundPrepared: async (e, _m, x) => {
      const preparer = uuid(e.args.preparedBy);
      await x.send(await x.role([Role.Accounts], [preparer]), {
        category: Action,
        kind: 'round.prepared',
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
        category: Outcome,
        kind: 'round.rejected',
        title: `Payout round #${String(e.args.roundId)} was sent back`,
        subject: { type: 'round', id: String(e.args.roundId) },
      });
    },
    RoundApproved: async (e, _m, x) => {
      await x.send(await x.role([Role.Accounts]), {
        category: Action,
        kind: 'round.approved',
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
        category: Outcome,
        kind: 'payout.paid',
        title: line?.amount
          ? `You were paid ${taka(line.amount)} taka`
          : 'A payout to you was paid',
        subject: { type: 'round', id: String(e.args.roundId) },
      });
    },
  },

  ConsentRegistry: {
    TrackRecordPublished: async (e, _m, x) => {
      await x.send([uuid(e.args.farmerId)], {
        category: Outcome,
        kind: 'track-record.published',
        title: `Your track record version ${String(e.args.version)} was published`,
        subject: { type: 'track-record', id: uuid(e.args.farmerId) ?? '' },
      });
    },
    ConsentGranted: consentNotice('consent.granted', 'gave permission to'),
    ConsentRevoked: consentNotice(
      'consent.revoked',
      'withdrew permission from',
    ),
    SummaryViewed: consentNotice('track-record.viewed', 'was viewed by'),
  },
};

// --- Shared rule shapes ---

function reservationClosed(status: string, title: string): Rule {
  return async (e, _m, x) => {
    const r = await x.one<{ investor_id: string }>(
      'SELECT investor_id FROM reservations WHERE id = $1',
      [Number(e.args.reservationId)],
    );
    await x.send([r?.investor_id], {
      category: Outcome,
      kind: `reservation.${status}`,
      title,
      subject: { type: 'reservation', id: String(e.args.reservationId) },
    });
  };
}

function voucherDecided(status: 'approved' | 'rejected' | 'cancelled'): Rule {
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
      status === 'rejected'
        ? [v.proposed_by_id]
        : [v.proposed_by_id, v.farmer_id, await x.officerOf(v.farmer_id)];
    await x.send(to, {
      category: Outcome,
      kind: `voucher.${status}`,
      title: `Voucher ${status}: ${v.quantity} ${v.input_type_code}`,
      subject: { type: 'voucher', id: uuid(e.args.voucherId) ?? '' },
    });
  };
}

function saleClosed(status: string): Rule {
  return async (e, _m, x) => {
    const s = await x.one<{ supplier_id: string }>(
      'SELECT supplier_id FROM voucher_sales WHERE id = $1',
      [Number(e.args.saleId)],
    );
    await x.send([s?.supplier_id], {
      category: Outcome,
      kind: `sale.${status}`,
      title: `Input sale #${String(e.args.saleId)} ${status}`,
      subject: { type: 'voucher-sale', id: String(e.args.saleId) },
    });
  };
}

function offerOutcome(kind: string, title: string): Rule {
  return async (e, _m, x) => {
    const o = await x.offer(e);
    await x.send([o?.buyer_id], {
      category: Outcome,
      kind,
      title,
      subject: { type: 'offer', id: String(e.args.offerId) },
    });
  };
}

function consentNotice(kind: string, verb: string): Rule {
  return async (e, _m, x) => {
    const bank = await x.one<{ name: string; branch_name: string }>(
      'SELECT name, branch_name FROM banks WHERE id = $1',
      [uuid(e.args.bankId)],
    );
    const bankName = bank ? `${bank.name}, ${bank.branch_name}` : 'a bank';
    const farmer = uuid(e.args.farmerId);
    await x.send([farmer], {
      category: Outcome,
      kind,
      title:
        kind === 'track-record.viewed'
          ? `Your track record ${verb} ${bankName}`
          : `You ${verb} ${bankName}`,
      subject: farmer ? { type: 'track-record', id: farmer } : null,
    });
  };
}
