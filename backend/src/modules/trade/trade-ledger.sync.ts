import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import {
  bytes32ToCode,
  bytes32ToUuid,
  ZERO_BYTES32,
} from '../../blockchain/utils/ids';
import { WEGRO_OWNER } from '../warehouse/warehouse.enums';
import { DeliverySide } from './trade.enums';

const EVENTS = [
  'ListingCreated',
  'ListingCancelled',
  'ListingSoldOut',
  'OfferMade',
  'OfferWithdrawn',
  'OfferRejected',
  'OfferApproved',
  'DealCancelled',
  'DealExpired',
  'BuyerPaymentConfirmed',
  'DeliveryConfirmed',
  'DealDelivered',
  'RequestPosted',
  'RequestCancelled',
  'ExternalListingCreated',
  'ListingApproved',
  'ListingRejected',
  'SellerPaid',
] as const;

/**
 * Keeps listings, offers, deliveries and buyer requests in step with
 * TradeLedger. Every offer change is one conditional statement from its
 * expected previous status; listing counters move only when that statement
 * changed a row. So an event applied twice (receipt, then indexer) counts
 * once. Rows the database does not know are skipped, never fatal.
 */
@Injectable()
export class TradeLedgerSync implements OnModuleInit {
  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of EVENTS) {
      this.handlers.on('TradeLedger', name, (e, m) => this.apply(e, m));
    }
    this.handlers.onReset(async (m) => {
      await m.query(
        `UPDATE "listings" SET "status" = NULL, "available" = "quantity", "unpaid_deals" = 0, "closed_at" = NULL`,
      );
      await m.query(`UPDATE "offers" SET "status" = NULL`);
      await m.query(
        `UPDATE "deliveries" SET "status" = 'submitted', "recorded_at" = NULL`,
      );
      await m.query(`UPDATE "buyer_requests" SET "status" = NULL`);
      await m.query(`UPDATE "listings" SET "decided_at" = NULL`);
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    const offerId = a.offerId === undefined ? 0 : Number(a.offerId);
    switch (event.eventName) {
      case 'ListingCreated': {
        if (a.projectId === ZERO_BYTES32) {
          // An external seller's own produce: no project, waiting for an admin.
          const sellerId = toUuid(a.seller);
          if (!sellerId) return;
          await m.query(
            `INSERT INTO "listings" ("id", "project_id", "farmer_id", "receipt_id", "seller_is_wegro", "seller_id",
               "produce_code", "quantity", "available", "asking_unit_price", "unpaid_deals", "status", "created_at")
             SELECT $1, NULL, NULL, NULL, false, $2, $3, $4, $4, $5, 0, 'pending', $6
              WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = $2)
             ON CONFLICT ("id") DO UPDATE SET "status" = 'pending' WHERE "listings"."status" IS NULL`,
            [
              Number(a.listingId),
              sellerId,
              bytes32ToCode(String(a.produceCode)),
              String(a.quantity),
              String(a.askingUnitPrice),
              when,
            ],
          );
          return;
        }
        const projectId = toUuid(a.projectId);
        if (!projectId) return;
        const wegro = a.seller === WEGRO_OWNER;
        const sellerId = wegro ? null : toUuid(a.seller);
        if (!wegro && !sellerId) return;
        await m.query(
          `INSERT INTO "listings" ("id", "project_id", "farmer_id", "receipt_id", "seller_is_wegro", "seller_id",
             "produce_code", "quantity", "available", "asking_unit_price", "unpaid_deals", "status", "created_at")
           SELECT $1, p."id", p."farmer_id", $3, $4, $5::uuid, $6, $7, $7, $8, 0, 'open', $9
             FROM "projects" p
            WHERE p."id" = $2
           ON CONFLICT ("id") DO UPDATE SET "status" = 'open' WHERE "listings"."status" IS NULL`,
          [
            Number(a.listingId),
            projectId,
            a.receiptId === ZERO_BYTES32 ? null : String(a.receiptId),
            wegro,
            sellerId,
            bytes32ToCode(String(a.produceCode)),
            String(a.quantity),
            String(a.askingUnitPrice),
            when,
          ],
        );
        return;
      }

      case 'ExternalListingCreated':
        // What the seller wrote (saved before sending, same fingerprint).
        await m.query(
          `UPDATE "listing_details" SET "listing_id" = $1
            WHERE "details_hash" = $2 AND "listing_id" IS NULL`,
          [Number(a.listingId), String(a.detailsHash)],
        );
        await m.query(
          `UPDATE "listings" SET "details_id" = d."id"
             FROM "listing_details" d
            WHERE "listings"."id" = $1 AND d."details_hash" = $2`,
          [Number(a.listingId), String(a.detailsHash)],
        );
        return;

      case 'ListingApproved':
      case 'ListingRejected':
        await m.query(
          `UPDATE "listings" SET "status" = $2::varchar, "decided_at" = $3,
                  "closed_at" = CASE WHEN $2::varchar = 'rejected' THEN $3 ELSE "closed_at" END
            WHERE "id" = $1 AND "status" = 'pending'`,
          [
            Number(a.listingId),
            event.eventName === 'ListingApproved' ? 'open' : 'rejected',
            when,
          ],
        );
        return;

      case 'SellerPaid':
        await this.move(m, offerId, 'delivered', 'seller_paid', when, {
          sql: `, "seller_payout_ref_hash" = $5, "seller_paid_at" = $4`,
          params: [String(a.paymentRefHash)],
        });
        return;

      case 'ListingCancelled':
        await m.query(
          `UPDATE "listings" SET "status" = 'cancelled', "closed_at" = $2
            WHERE "id" = $1 AND "status" IN ('open', 'pending')`,
          [Number(a.listingId), when],
        );
        return;

      case 'ListingSoldOut':
        await m.query(
          `UPDATE "listings" SET "status" = $2, "closed_at" = $3 WHERE "id" = $1 AND "status" = 'open'`,
          [Number(a.listingId), 'sold_out', when],
        );
        return;

      case 'OfferMade': {
        const buyerId = toUuid(a.buyerId);
        if (!buyerId) return;
        await m.query(
          `INSERT INTO "offers" ("id", "listing_id", "buyer_id", "quantity", "unit_price", "status", "made_at")
           SELECT $1, $2, $3, $4, $5, 'pending', $6
            WHERE EXISTS (SELECT 1 FROM "listings" WHERE "id" = $2)
              AND EXISTS (SELECT 1 FROM "users" WHERE "id" = $3)
           ON CONFLICT ("id") DO UPDATE SET "status" = 'pending' WHERE "offers"."status" IS NULL`,
          [
            offerId,
            Number(a.listingId),
            buyerId,
            String(a.quantity),
            String(a.unitPrice),
            when,
          ],
        );
        return;
      }

      case 'OfferWithdrawn':
      case 'OfferRejected':
        await this.move(
          m,
          offerId,
          'pending',
          event.eventName === 'OfferRejected' ? 'rejected' : 'withdrawn',
          when,
        );
        return;

      case 'OfferApproved': {
        const moved = await this.move(m, offerId, 'pending', 'approved', when, {
          sql: `, "payment_due_at" = to_timestamp($5), "buyer_fee" = $6, "seller_fee" = $7`,
          params: [
            Number(a.paymentDueAt),
            String(a.buyerFee),
            String(a.sellerFee),
          ],
        });
        if (moved) {
          await m.query(
            `UPDATE "listings" SET "available" = "available" - $2, "unpaid_deals" = "unpaid_deals" + 1 WHERE "id" = $1`,
            [moved.listingId, moved.quantity],
          );
        }
        return;
      }

      case 'DealCancelled':
      case 'DealExpired': {
        const moved = await this.move(
          m,
          offerId,
          'approved',
          event.eventName === 'DealExpired' ? 'expired' : 'cancelled',
          when,
        );
        if (moved) {
          await m.query(
            `UPDATE "listings" SET "available" = "available" + $2, "unpaid_deals" = "unpaid_deals" - 1 WHERE "id" = $1`,
            [moved.listingId, moved.quantity],
          );
        }
        return;
      }

      case 'BuyerPaymentConfirmed': {
        const part =
          a.receiptPartId === ZERO_BYTES32 ? null : String(a.receiptPartId);
        const moved = await this.move(m, offerId, 'approved', 'paid', when, {
          sql: `, "payment_ref_hash" = $5, "receipt_part_id" = $6, "paid_at" = $4`,
          params: [String(a.paymentRefHash), part],
        });
        if (moved) {
          await m.query(
            `UPDATE "listings" SET "unpaid_deals" = "unpaid_deals" - 1 WHERE "id" = $1`,
            [moved.listingId],
          );
        }
        return;
      }

      case 'DeliveryConfirmed': {
        const side = a.isBuyer ? DeliverySide.BUYER : DeliverySide.HANDLER;
        // Ours (saved before sending, same fingerprint) becomes recorded; one
        // made outside this backend is kept without notes or photo.
        await m.query(
          `INSERT INTO "deliveries" ("offer_id", "side", "quantity", "quality_hash", "confirmed_by_id", "status", "recorded_at")
           SELECT $1, $2, $3, $4, $5::uuid, 'recorded', $6
            WHERE EXISTS (SELECT 1 FROM "offers" WHERE "id" = $1)
           ON CONFLICT ("offer_id", "side") DO UPDATE SET "status" = 'recorded', "recorded_at" = EXCLUDED."recorded_at"
             WHERE "deliveries"."quality_hash" = EXCLUDED."quality_hash"`,
          [
            offerId,
            side,
            String(a.quantity),
            String(a.qualityHash),
            toUuid(a.confirmedBy),
            when,
          ],
        );
        return;
      }

      case 'DealDelivered':
        await this.move(m, offerId, 'paid', 'delivered', when, {
          sql: `, "delivered_at" = $4`,
          params: [],
        });
        return;

      case 'RequestPosted': {
        const buyerId = toUuid(a.buyerId);
        if (!buyerId) return;
        await m.query(
          `INSERT INTO "buyer_requests" ("id", "buyer_id", "produce_code", "quantity", "max_unit_price", "valid_until", "status", "posted_at")
           SELECT $1, $2, $3, $4, $5, to_timestamp($6), 'open', $7
            WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = $2)
           ON CONFLICT ("id") DO UPDATE SET "status" = 'open' WHERE "buyer_requests"."status" IS NULL`,
          [
            Number(a.requestId),
            buyerId,
            bytes32ToCode(String(a.produceCode)),
            String(a.quantity),
            String(a.maxUnitPrice),
            Number(a.validUntil),
            when,
          ],
        );
        return;
      }

      case 'RequestCancelled':
        await m.query(
          `UPDATE "buyer_requests" SET "status" = 'cancelled' WHERE "id" = $1 AND "status" = 'open'`,
          [Number(a.requestId)],
        );
        return;
    }
  }

  /**
   * One offer status change, only from `from`. Returns the offer's listing
   * and quantity if this call made the change, null if already done.
   * `extra` adds SET clauses; its parameters start at $5 ($4 is the time).
   */
  private async move(
    m: EntityManager,
    offerId: number,
    from: string,
    to: string,
    when: Date,
    extra: { sql: string; params: unknown[] } = { sql: '', params: [] },
  ): Promise<{ listingId: number; quantity: string } | null> {
    // UPDATE ... RETURNING comes back from TypeORM as [rows, affected].
    const [rows] = (await m.query(
      `UPDATE "offers" SET "status" = $3, "decided_at" = COALESCE("decided_at", $4)${extra.sql}
        WHERE "id" = $1 AND "status" = $2
        RETURNING "listing_id", "quantity"`,
      [offerId, from, to, when, ...extra.params],
    )) as [Array<{ listing_id: string; quantity: string }>, number];
    return rows[0]
      ? { listingId: Number(rows[0].listing_id), quantity: rows[0].quantity }
      : null;
  }
}

function toUuid(value: unknown): string | null {
  try {
    return typeof value === 'string' ? bytes32ToUuid(value) : null;
  } catch {
    return null;
  }
}
