import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { IsNull, Not, type EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid, ZERO_BYTES32 } from '../../blockchain/utils/ids';
import { bdLastDay } from '../../common/time/bd-dates';
import { ReceiptRecheck } from './entities/receipt-recheck.entity';
import { WarehouseOperator } from './entities/warehouse-operator.entity';
import { WarehouseReceipt } from './entities/warehouse-receipt.entity';
import { WarehouseSite } from './entities/warehouse-site.entity';
import { ReceiptStatus, WEGRO_OWNER } from './warehouse.enums';

const EVENTS = [
  'SiteRegistered',
  'OperatorAssigned',
  'ReceiptIssued',
  'HandoverOffered',
  'HandoverCancelled',
  'ReceiptTransferred',
  'ExpiryExtended',
  'ReceiptListed',
  'ReceiptSplit',
  'ReceiptCollected',
] as const;

/**
 * Keeps sites, operators and receipts in step with WarehouseReceipt. Every
 * apply is idempotent: per-receipt and per-operator changes are guarded by
 * the event's (block, log) position, and a split moves quantity only when it
 * creates the buyer's receipt (unique id), so it cannot happen twice.
 */
@Injectable()
export class WarehouseLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(WarehouseLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of EVENTS) {
      this.handlers.on('WarehouseReceipt', name, (e, m) => this.apply(e, m));
    }
    this.handlers.onReset(async (m) => {
      await m.delete(WarehouseReceipt, { parentId: Not(IsNull()) });
      await m.query(
        `UPDATE "warehouse_receipts"
            SET "status" = 'submitted', "quantity" = "original_quantity", "pending_to_wegro" = false,
                "handover_offered_at" = NULL,
                "collected_at" = NULL, "chain_event_block" = -1, "chain_event_log" = -1`,
      );
      await m
        .createQueryBuilder()
        .update(ReceiptRecheck)
        .set({ status: 'submitted' })
        .execute();
      await m
        .createQueryBuilder()
        .update(WarehouseSite)
        .set({ status: 'submitted' })
        .execute();
      await m
        .createQueryBuilder()
        .update(WarehouseOperator)
        .set({ siteId: null, chainEventBlock: -1, chainEventLog: -1 })
        .execute();
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    switch (event.eventName) {
      case 'SiteRegistered': {
        const id = toUuid(a.siteId);
        if (id)
          await m.update(
            WarehouseSite,
            { id, status: 'submitted' },
            { status: 'registered' },
          );
        return;
      }

      case 'OperatorAssigned': {
        const operatorId = toUuid(a.operatorId);
        if (!operatorId) return;
        const siteId = a.siteId === ZERO_BYTES32 ? null : toUuid(a.siteId);
        await m.query(
          `INSERT INTO "warehouse_operators" ("operator_id", "site_id", "chain_event_block", "chain_event_log", "updated_at")
           SELECT $1, $2::uuid, $3, $4, now()
            WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = $1)
              AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM "warehouse_sites" WHERE "id" = $2::uuid))
           ON CONFLICT ("operator_id") DO UPDATE
             SET "site_id" = EXCLUDED."site_id",
                 "chain_event_block" = EXCLUDED."chain_event_block",
                 "chain_event_log" = EXCLUDED."chain_event_log",
                 "updated_at" = now()
           WHERE ("warehouse_operators"."chain_event_block", "warehouse_operators"."chain_event_log")
              <= (EXCLUDED."chain_event_block", EXCLUDED."chain_event_log")`,
          [operatorId, siteId, event.blockNumber, event.logIndex],
        );
        return;
      }

      case 'ReceiptIssued': {
        const row = await m.findOne(WarehouseReceipt, {
          where: { id: String(a.receiptId) },
          select: { id: true, detailsHash: true },
        });
        if (!row) return;
        if (row.detailsHash !== a.detailsHash) {
          this.logger.error(
            `Ledger intake fingerprint of receipt ${row.id} differs from the database`,
          );
        }
        return this.patch(m, event, {
          status: ReceiptStatus.ISSUED,
          ...owner(String(a.owner)),
          quantity: Number(a.quantity),
          expiresOn: bdLastDay(Number(a.expiresAt)),
          issuedById: toUuid(a.issuedBy),
          issuedAt: when,
        });
      }

      case 'HandoverOffered':
        return this.patch(m, event, {
          status: ReceiptStatus.PENDING_HANDOVER,
          pendingToWegro: true,
          handoverOfferedAt: event.blockTime ?? new Date(),
        });

      case 'HandoverCancelled':
        return this.patch(m, event, {
          status: ReceiptStatus.ISSUED,
          pendingToWegro: false,
          handoverOfferedAt: null,
        });

      case 'ReceiptTransferred': {
        // An accepted buy-back returns the receipt to Issued under WeGro; a
        // buyer's split-off receipt stays Sold.
        const row = await m.findOne(WarehouseReceipt, {
          where: { id: String(a.receiptId) },
          select: { id: true, status: true },
        });
        if (!row) return;
        return this.patch(m, event, {
          ...owner(String(a.to)),
          pendingToWegro: false,
          handoverOfferedAt: null,
          ...(row.status === ReceiptStatus.PENDING_HANDOVER && {
            status: ReceiptStatus.ISSUED,
          }),
        });
      }

      case 'ExpiryExtended':
        await m.update(
          ReceiptRecheck,
          { recheckHash: String(a.recheckHash), status: 'submitted' },
          { status: 'recorded' },
        );
        return this.patch(m, event, {
          expiresOn: bdLastDay(Number(a.newExpiresAt)),
        });

      case 'ReceiptListed':
        return this.patch(m, event, {
          status: a.listed ? ReceiptStatus.LISTED : ReceiptStatus.ISSUED,
        });

      case 'ReceiptSplit': {
        const buyer = toUuid(a.buyerId);
        if (!buyer) return;
        const quantity = Number(a.quantity);
        const inserted: unknown[] = await m.query(
          `INSERT INTO "warehouse_receipts" (
             "id", "project_id", "site_id", "owner_id", "owner_is_wegro", "pending_to_wegro",
             "produce_code", "quantity", "original_quantity", "status", "parent_id",
             "bag_count", "moisture_percent", "storage_bay", "intake_date", "notes", "details_hash",
             "expires_on", "issued_by_id", "issued_at", "chain_event_block", "chain_event_log")
           SELECT $2, p."project_id", p."site_id", $3, false, false,
                  p."produce_code", $4, $4, 'sold', p."id",
                  NULL, p."moisture_percent", p."storage_bay", p."intake_date", p."notes", p."details_hash",
                  p."expires_on", p."issued_by_id", $5, $6, $7
             FROM "warehouse_receipts" p
            WHERE p."id" = $1 AND EXISTS (SELECT 1 FROM "users" WHERE "id" = $3)
           ON CONFLICT ("id") DO NOTHING
           RETURNING "id"`,
          [
            String(a.parentId),
            String(a.childId),
            buyer,
            quantity,
            when,
            event.blockNumber,
            event.logIndex,
          ],
        );
        if (inserted.length === 1) {
          // Once, with the buyer's receipt. The parent also records this
          // event's position (only ever moving forward), so an older event
          // replayed later, such as its listing, cannot undo the sale.
          await m.query(
            `UPDATE "warehouse_receipts"
                SET "quantity" = "quantity" - $2,
                    "status" = CASE WHEN "quantity" - $2 = 0 THEN 'sold_out' ELSE "status" END,
                    "chain_event_block" = CASE WHEN ("chain_event_block", "chain_event_log") < ($3, $4)
                                               THEN $3 ELSE "chain_event_block" END,
                    "chain_event_log" = CASE WHEN ("chain_event_block", "chain_event_log") < ($3, $4)
                                             THEN $4 ELSE "chain_event_log" END
              WHERE "id" = $1`,
            [String(a.parentId), quantity, event.blockNumber, event.logIndex],
          );
        }
        return;
      }

      case 'ReceiptCollected':
        return this.patch(m, event, {
          status: ReceiptStatus.COLLECTED,
          collectedAt: when,
        });
    }
  }

  /** One guarded primary-key update: never overwrites a newer ledger event. */
  private async patch(
    m: EntityManager,
    event: ChainEvent,
    values: Partial<WarehouseReceipt>,
  ): Promise<void> {
    await m
      .createQueryBuilder()
      .update(WarehouseReceipt)
      .set({
        ...values,
        chainEventBlock: event.blockNumber,
        chainEventLog: event.logIndex,
      })
      .where('id = :id', { id: String(event.args.receiptId) })
      .andWhere('(chain_event_block, chain_event_log) <= (:b, :l)', {
        b: event.blockNumber,
        l: event.logIndex,
      })
      .execute();
  }
}

/** Ledger owner id -> owner columns: WeGro, or a participant. */
function owner(
  ledgerOwner: string,
): Pick<WarehouseReceipt, 'ownerId' | 'ownerIsWegro'> {
  return ledgerOwner === WEGRO_OWNER
    ? { ownerId: null, ownerIsWegro: true }
    : { ownerId: toUuid(ledgerOwner), ownerIsWegro: false };
}

function toUuid(value: unknown): string | null {
  try {
    return typeof value === 'string' ? bytes32ToUuid(value) : null;
  } catch {
    return null;
  }
}
