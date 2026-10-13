import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid, uuidToBytes32 } from '../../blockchain/utils/ids';
import { Project } from '../projects/entities/project.entity';
import {
  type Holding,
  lineHash,
  roundFingerprint,
  splitRound,
} from './settlement-math';

/** Confirmed slots per investor: fixed once a project is funded. */
export async function loadHoldings(
  db: Pick<EntityManager, 'query'>,
  projectId: string,
): Promise<Holding[]> {
  const rows: Array<{ investor_id: string; slots: string }> = await db.query(
    `SELECT investor_id, SUM(slots) AS slots
       FROM reservations
      WHERE project_id = $1 AND status = 'confirmed'
      GROUP BY investor_id
      ORDER BY MIN(id)`,
    [projectId],
  );
  return rows.map((r) => ({
    investorId: r.investor_id,
    slots: Number(r.slots),
  }));
}

/**
 * Keeps costs, rounds and payout lines in step with SettlementLedger. The
 * ledger keeps per-payee amounts only as hashes: when a round is prepared its
 * split and lines are worked out here from the project's terms and holdings
 * and checked against the ledger's fingerprint and line hashes. Changes are
 * one-way, so applying an event twice changes nothing; a rebuild hides rows
 * instead of deleting them, keeping encrypted references and reasons.
 */
@Injectable()
export class SettlementLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(SettlementLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of [
      'CostAdded',
      'CostVoided',
      'PayoutLine',
      'RoundPrepared',
      'RoundApproved',
      'RoundRejected',
      'PaymentRecorded',
      'RoundPaid',
    ]) {
      this.handlers.on('SettlementLedger', name, (e, m) => this.apply(e, m));
    }
    this.handlers.onReset(async (m) => {
      await m.query(
        `UPDATE "project_costs" SET "status" = 'submitted', "cost_id" = NULL, "recorded_at" = NULL, "voided_at" = NULL`,
      );
      await m.query(
        `UPDATE "settlement_rounds" SET "status" = NULL, "approved_by_id" = NULL, "approved_at" = NULL,
                "rejected_at" = NULL, "paid_count" = 0, "paid_at" = NULL`,
      );
      await m.query(`UPDATE "payout_lines" SET "paid_at" = NULL`);
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    const roundId = a.roundId === undefined ? 0 : Number(a.roundId);
    switch (event.eventName) {
      case 'CostAdded': {
        const projectId = toUuid(a.projectId);
        if (!projectId) return;
        const res = await m.query(
          `UPDATE "project_costs" SET "cost_id" = $1, "status" = 'recorded', "recorded_at" = $4
            WHERE "details_hash" = $2 AND "project_id" = $3 AND "status" = 'submitted'`,
          [Number(a.costId), String(a.detailsHash), projectId, when],
        );
        if (affected(res) === 0) {
          this.logger.debug(
            `CostAdded ${String(a.costId)}: unknown or already applied`,
          );
        }
        return;
      }

      case 'CostVoided':
        await m.query(
          `UPDATE "project_costs" SET "status" = 'voided', "voided_at" = $2
            WHERE "cost_id" = $1 AND "status" = 'recorded'`,
          [Number(a.costId), when],
        );
        return;

      // Emitted before RoundPrepared, which then works out and checks the amounts.
      case 'PayoutLine': {
        const payeeId = toUuid(a.payeeId);
        if (!payeeId) return;
        await m.query(
          `INSERT INTO "payout_lines" ("round_id", "payee_id", "line_hash", "verified")
           VALUES ($1, $2, $3, false)
           ON CONFLICT ("round_id", "payee_id") DO UPDATE SET "line_hash" = EXCLUDED."line_hash"`,
          [roundId, payeeId, String(a.lineHash)],
        );
        return;
      }

      case 'RoundPrepared':
        await this.prepared(event, m, roundId);
        return;

      case 'RoundApproved':
        await m.query(
          `UPDATE "settlement_rounds" SET "status" = 'approved', "approved_by_id" = $2, "approved_at" = $3
            WHERE "id" = $1 AND "status" = 'prepared'`,
          [roundId, toUuid(a.approvedBy), when],
        );
        return;

      case 'RoundRejected': {
        const rows: Array<{ reject_reason_hash: string | null }> =
          await m.query(
            `SELECT "reject_reason_hash" FROM "settlement_rounds" WHERE "id" = $1`,
            [roundId],
          );
        if (rows.length === 0) return;
        if (
          rows[0].reject_reason_hash &&
          rows[0].reject_reason_hash !== a.reasonHash
        ) {
          this.logger.error(
            `Ledger reason for rejecting round ${roundId} differs from the database`,
          );
        }
        await m.query(
          `UPDATE "settlement_rounds"
              SET "status" = 'rejected', "rejected_at" = $2,
                  "reject_reason_hash" = COALESCE("reject_reason_hash", $3)
            WHERE "id" = $1 AND "status" = 'prepared'`,
          [roundId, when, String(a.reasonHash)],
        );
        return;
      }

      case 'PaymentRecorded': {
        const payeeId = toUuid(a.payeeId);
        if (!payeeId) return;
        const hash = String(a.paymentRefHash);
        // A saved reference that is not the one the ledger took is dropped, never shown as paid.
        const res = await m.query(
          `UPDATE "payout_lines"
              SET "paid_at" = $3, "payment_ref_hash" = $4,
                  "payment_ref_enc" = CASE WHEN "payment_ref_hash" = $4 THEN "payment_ref_enc" END
            WHERE "round_id" = $1 AND "payee_id" = $2 AND "paid_at" IS NULL`,
          [roundId, payeeId, when, hash],
        );
        if (affected(res) === 1) {
          await m.query(
            `UPDATE "settlement_rounds" SET "paid_count" = "paid_count" + 1 WHERE "id" = $1`,
            [roundId],
          );
        }
        return;
      }

      case 'RoundPaid':
        await m.query(
          `UPDATE "settlement_rounds" SET "status" = 'paid', "paid_at" = $2
            WHERE "id" = $1 AND "status" = 'approved'`,
          [roundId, when],
        );
        return;
    }
  }

  /**
   * Works out the split and lines from the ledger's totals, the project's
   * percentages and its holdings, and checks them against the ledger.
   */
  private async prepared(event: ChainEvent, m: EntityManager, roundId: number) {
    const a = event.args;
    const projectId = toUuid(a.projectId);
    const preparedBy = toUuid(a.preparedBy);
    if (!projectId || !preparedBy) return;
    const project = await m.findOne(Project, {
      where: { id: projectId },
      select: {
        id: true,
        farmerId: true,
        farmerBps: true,
        investorBps: true,
        wegroBps: true,
        issuedSlots: true,
        slotPrice: true,
      },
    });
    if (!project) {
      this.logger.error(
        `Round ${roundId} is for unknown project ${projectId}; skipped`,
      );
      return;
    }
    const { figures, lines } = splitRound(
      {
        income: BigInt(String(a.income)),
        costs: BigInt(String(a.costs)),
        profit: BigInt(String(a.profit)),
        capitalReturn: BigInt(String(a.capitalReturn)),
      },
      project,
      project.farmerId,
      await loadHoldings(m, projectId),
    );

    let verified =
      roundFingerprint(roundId, uuidToBytes32(projectId), figures) ===
      a.fingerprint;
    for (const line of lines) {
      const res = await m.query(
        `UPDATE "payout_lines"
            SET "payee_role" = $3, "slots" = $4, "amount" = $5, "verified" = ("line_hash" = $6)
          WHERE "round_id" = $1 AND "payee_id" = $2
          RETURNING "verified"`,
        [
          roundId,
          line.payeeId,
          line.role,
          line.slots,
          line.amount.toString(),
          lineHash(roundId, uuidToBytes32(line.payeeId), line.amount),
        ],
      );
      const [rows] = res as [Array<{ verified: boolean }>, number];
      if (rows[0]?.verified !== true) verified = false;
    }
    const [{ count }]: Array<{ count: string }> = await m.query(
      `SELECT COUNT(*) AS count FROM "payout_lines" WHERE "round_id" = $1`,
      [roundId],
    );
    if (Number(count) !== lines.length) verified = false;
    if (!verified) {
      this.logger.error(
        `Round ${roundId}: the split worked out here does not match the ledger; amounts are not shown as checked`,
      );
    }

    await m.query(
      `INSERT INTO "settlement_rounds"
         ("id", "project_id", "is_final", "status", "income", "costs", "profit", "farmer_share", "investor_share",
          "wegro_share", "capital_return", "leftover", "fingerprint", "verified", "prepared_by_id", "prepared_at",
          "payee_count", "paid_count")
       VALUES ($1, $2, $3, 'prepared', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0)
       ON CONFLICT ("id") DO UPDATE SET "status" = 'prepared', "verified" = EXCLUDED."verified"
        WHERE "settlement_rounds"."status" IS NULL`,
      [
        roundId,
        projectId,
        Boolean(a.isFinal),
        figures.income.toString(),
        figures.costs.toString(),
        figures.profit.toString(),
        figures.farmerShare.toString(),
        figures.investorShare.toString(),
        figures.wegroShare.toString(),
        figures.capitalReturn.toString(),
        figures.leftover.toString(),
        String(a.fingerprint),
        verified,
        preparedBy,
        event.blockTime ?? new Date(),
        Number(count),
      ],
    );
  }
}

function toUuid(value: unknown): string | null {
  try {
    return typeof value === 'string' ? bytes32ToUuid(value) : null;
  } catch {
    return null;
  }
}

/** Rows changed by a raw UPDATE: TypeORM returns [rows, count] for Postgres. */
function affected(result: unknown): number {
  return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
}
