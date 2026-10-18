import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid } from '../../blockchain/utils/ids';
import { InputBatch } from './entities/input-batch.entity';
import { VoucherSale } from './entities/voucher-sale.entity';
import { Voucher } from './entities/voucher.entity';
import { BatchStatus, SaleStatus, VoucherStatus } from './voucher.enums';

const EVENTS = [
  'VoucherProposed',
  'VoucherApproved',
  'VoucherRejected',
  'VoucherCancelled',
  'BatchRegistered',
  'SaleRecorded',
  'SaleConfirmed',
  'SaleCancelled',
  'SaleExpired',
] as const;

/**
 * Keeps vouchers, batches and sales in step with VoucherRegistry. Applied from
 * receipts and again by the indexer, so every apply is idempotent:
 * - voucher status changes are guarded by the event's (block, log) position;
 * - balances move only together with a one-way sale status change made in
 *   the same statement, so a repeated event cannot count twice;
 * - last activity only moves forward.
 * Events about rows this database does not know are skipped, never fatal.
 */
@Injectable()
export class VoucherLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(VoucherLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of EVENTS) {
      this.handlers.on('VoucherRegistry', name, (e, m) => this.apply(e, m));
    }
    this.handlers.onReset(async (m) => {
      await m
        .createQueryBuilder()
        .update(Voucher)
        .set({
          status: VoucherStatus.SUBMITTED,
          spentQuantity: 0,
          heldQuantity: 0,
          voidedAmount: null,
          chainEventBlock: -1,
          chainEventLog: -1,
        })
        .execute();
      await m
        .createQueryBuilder()
        .update(VoucherSale)
        .set({ status: null })
        .execute();
      await m
        .createQueryBuilder()
        .update(InputBatch)
        .set({ status: BatchStatus.SUBMITTED, registeredAt: null })
        .execute();
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    switch (event.eventName) {
      case 'VoucherProposed':
        return this.setStatus(m, event, VoucherStatus.PROPOSED, {
          proposedAt: when,
          lastActivityAt: when,
        });
      case 'VoucherApproved':
        return this.setStatus(m, event, VoucherStatus.ACTIVE, {
          lastActivityAt: when,
        });
      case 'VoucherRejected':
        return this.setStatus(m, event, VoucherStatus.REJECTED, {});
      case 'VoucherCancelled':
        return this.setStatus(m, event, VoucherStatus.CANCELLED, {
          voidedAmount: BigInt(String(a.voidedAmount)),
        });

      case 'BatchRegistered': {
        const id = toUuid(a.batchId);
        if (id) {
          await m.update(
            InputBatch,
            { id, status: BatchStatus.SUBMITTED },
            { status: BatchStatus.REGISTERED, registeredAt: when },
          );
        }
        return;
      }

      case 'SaleRecorded': {
        const voucherId = toUuid(a.voucherId);
        const supplierId = toUuid(a.supplierId);
        if (!voucherId || !supplierId) return;
        const id = Number(a.saleId);
        const quantity = Number(a.quantity);
        const rows: unknown[] = await m.query(
          `INSERT INTO "voucher_sales" ("id", "voucher_id", "supplier_id", "quantity", "amount", "status", "recorded_at", "expires_at")
           SELECT $1, $2, $3, $4, $5, 'pending', $6, to_timestamp($7)
            WHERE EXISTS (SELECT 1 FROM "vouchers" WHERE "id" = $2)
              AND EXISTS (SELECT 1 FROM "users" WHERE "id" = $3)
           ON CONFLICT ("id") DO UPDATE SET "status" = 'pending'
             WHERE "voucher_sales"."status" IS NULL
           RETURNING "id"`,
          [
            id,
            voucherId,
            supplierId,
            quantity,
            String(a.amount),
            when,
            Number(a.expiresAt),
          ],
        );
        if (rows.length === 0) return;
        await m.query(
          `UPDATE "vouchers"
              SET "held_quantity" = "held_quantity" + $2,
                  "last_activity_at" = GREATEST("last_activity_at", $3)
            WHERE "id" = $1`,
          [voucherId, quantity, when],
        );
        const batchIds = ((a.batchIds as string[]) ?? []).map(toUuid);
        // Only batches known here; position keeps the ledger's order.
        await m.query(
          `INSERT INTO "voucher_sale_batches" ("sale_id", "batch_id", "position")
           SELECT $1, b.id, b.position
             FROM unnest($2::uuid[]) WITH ORDINALITY AS b(id, position)
            WHERE b.id IS NOT NULL
              AND EXISTS (SELECT 1 FROM "input_batches" WHERE "id" = b.id)
           ON CONFLICT DO NOTHING`,
          [id, batchIds],
        );
        return;
      }

      case 'SaleConfirmed': {
        const closed = await this.closeSale(
          m,
          Number(a.saleId),
          SaleStatus.CONFIRMED,
          when,
          toUuid(a.confirmedBy),
        );
        if (closed) {
          await m.query(
            `UPDATE "vouchers"
                SET "held_quantity" = "held_quantity" - $2,
                    "spent_quantity" = "spent_quantity" + $2,
                    "last_activity_at" = GREATEST("last_activity_at", $3)
              WHERE "id" = $1`,
            [closed.voucherId, closed.quantity, when],
          );
        }
        return;
      }

      case 'SaleCancelled':
      case 'SaleExpired': {
        const status =
          event.eventName === 'SaleExpired'
            ? SaleStatus.EXPIRED
            : SaleStatus.CANCELLED;
        const closed = await this.closeSale(m, Number(a.saleId), status, when);
        if (closed) {
          // A released hold on a cancelled voucher is voided, as on the ledger.
          await m.query(
            `UPDATE "vouchers"
                SET "held_quantity" = "held_quantity" - $2,
                    "voided_amount" = CASE WHEN "status" = 'cancelled'
                      THEN COALESCE("voided_amount", 0) + $3 ELSE "voided_amount" END
              WHERE "id" = $1`,
            [closed.voucherId, closed.quantity, closed.amount],
          );
        }
        return;
      }
    }
  }

  /** Voucher status, applied only if no newer ledger event was applied already. */
  private async setStatus(
    m: EntityManager,
    event: ChainEvent,
    status: VoucherStatus,
    patch: Partial<Voucher>,
  ): Promise<void> {
    const id = toUuid(event.args.voucherId);
    if (!id) return;
    const res = await m
      .createQueryBuilder()
      .update(Voucher)
      .set({
        ...patch,
        status,
        chainEventBlock: event.blockNumber,
        chainEventLog: event.logIndex,
      })
      .where('id = :id', { id })
      .andWhere('(chain_event_block, chain_event_log) <= (:b, :l)', {
        b: event.blockNumber,
        l: event.logIndex,
      })
      .execute();
    if (res.affected === 0) {
      this.logger.debug(
        `${event.eventName} for voucher ${id}: unknown or older; ignored`,
      );
    }
  }

  /** pending -> final in one conditional statement; null if already done or unknown. */
  private async closeSale(
    m: EntityManager,
    id: number,
    status: SaleStatus,
    when: Date,
    confirmedById: string | null = null,
  ): Promise<{ voucherId: string; quantity: number; amount: string } | null> {
    // UPDATE ... RETURNING comes back from TypeORM as [rows, affected].
    const [rows] = (await m.query(
      `UPDATE "voucher_sales"
          SET "status" = $2, "closed_at" = $3, "confirmed_by_id" = $4
        WHERE "id" = $1 AND "status" = 'pending'
        RETURNING "voucher_id", "quantity", "amount"`,
      [id, status, when, confirmedById],
    )) as [
      Array<{ voucher_id: string; quantity: string; amount: string }>,
      number,
    ];
    const row = rows[0];
    return row
      ? {
          voucherId: row.voucher_id,
          quantity: Number(row.quantity),
          amount: row.amount,
        }
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
