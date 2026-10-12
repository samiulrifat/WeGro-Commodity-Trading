import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid } from '../../blockchain/utils/ids';
import { Project } from './entities/project.entity';
import { Refund } from './entities/refund.entity';
import { Reservation } from './entities/reservation.entity';
import {
  ProjectChainState,
  ProjectStage,
  ReservationStatus,
  STAGE_BY_CHAIN,
} from './project.enums';

export interface LedgerEvent {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  blockTime?: Date;
}

const EVENTS = [
  'ProjectCreated',
  'ProjectStageChanged',
  'SlotsReserved',
  'ReservationConfirmed',
  'ReservationExpired',
  'ReservationCancelled',
  'RefundsRequired',
  'RefundRecorded',
] as const;

/**
 * Keeps projects, reservations and refunds in step with ProjectLedger.
 *
 * Every event is applied straight from the receipt and again by the indexer,
 * so each apply must be idempotent:
 * - stage changes are guarded by the event's (block, log) position;
 * - slot counters only move together with a one-way reservation status change
 *   made in the same statement (pending -> confirmed, expired or cancelled),
 *   so an event applied twice cannot count twice.
 * Each apply is a handful of primary-key reads and writes.
 */
@Injectable()
export class ProjectLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(ProjectLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of EVENTS) {
      this.handlers.on('ProjectLedger', name, (event, m) =>
        this.apply(event, m),
      );
    }
    // Full re-index: forget the ledger's view, keep what only the database
    // knows (terms, encrypted payment references). The replay restores the rest.
    this.handlers.onReset(async (m) => {
      await m
        .createQueryBuilder()
        .update(Project)
        .set({
          chainState: ProjectChainState.Submitted,
          stage: ProjectStage.Draft,
          issuedSlots: 0,
          reservedSlots: 0,
          refundTotal: null,
          chainEventBlock: -1,
          chainEventLog: -1,
        })
        .where('chain_state <> :local', { local: ProjectChainState.Local })
        .execute();
      await m
        .createQueryBuilder()
        .update(Reservation)
        .set({ status: null })
        .execute();
      await m
        .createQueryBuilder()
        .update(Refund)
        .set({ confirmed: false })
        .execute();
    });
  }

  async apply(event: LedgerEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    switch (event.eventName) {
      case 'ProjectCreated': {
        const id = toUuid(a.projectId);
        if (!id) return;
        const project = await m.findOne(Project, {
          where: { id },
          select: { id: true, termsHash: true, totalSlots: true },
        });
        if (!project) return this.unknown(event, id);
        if (
          project.termsHash !== a.termsHash ||
          project.totalSlots !== Number(a.totalSlots)
        ) {
          this.logger.error(
            `Ledger terms of project ${id} do not match the database`,
          );
        }
        await m.update(
          Project,
          { id },
          { chainState: ProjectChainState.Confirmed },
        );
        return;
      }

      case 'ProjectStageChanged': {
        const id = toUuid(a.projectId);
        const stage = STAGE_BY_CHAIN[Number(a.newStage)];
        if (!id || !stage) return;
        const patch: Partial<Project> = { stage, stageChangedAt: when };
        await m
          .createQueryBuilder()
          .update(Project)
          .set({
            ...patch,
            chainEventBlock: event.blockNumber,
            chainEventLog: event.logIndex,
            ...(stage === ProjectStage.OpenForFunding && {
              publishedAt: () => 'COALESCE("published_at", :publishedAt)',
            }),
          })
          .setParameter('publishedAt', when)
          .where('id = :id', { id })
          .andWhere('(chain_event_block, chain_event_log) <= (:b, :l)', {
            b: event.blockNumber,
            l: event.logIndex,
          })
          .execute();
        return;
      }

      case 'SlotsReserved': {
        const id = Number(a.reservationId);
        const projectId = toUuid(a.projectId);
        const investorId = toUuid(a.investorId);
        if (!projectId || !investorId) return;
        const slots = Number(a.slots);
        // New row, or a row waiting for replay: either way it becomes pending
        // exactly once, and only then are the slots counted.
        // Skipped if the project or investor is unknown here (made outside this backend).
        const rows: unknown[] = await m.query(
          `INSERT INTO "reservations" ("id", "project_id", "investor_id", "slots", "expires_at", "status", "reserved_at")
           SELECT $1, $2, $3, $4, to_timestamp($5), 'pending', $6
            WHERE EXISTS (SELECT 1 FROM "projects" WHERE "id" = $2)
              AND EXISTS (SELECT 1 FROM "users" WHERE "id" = $3)
           ON CONFLICT ("id") DO UPDATE SET "status" = 'pending'
             WHERE "reservations"."status" IS NULL
           RETURNING "id"`,
          [id, projectId, investorId, slots, Number(a.expiresAt), when],
        );
        if (rows.length === 1) {
          await m.increment(Project, { id: projectId }, 'reservedSlots', slots);
        }
        return;
      }

      case 'ReservationConfirmed': {
        const id = Number(a.reservationId);
        const slots = await this.close(
          m,
          id,
          ReservationStatus.Confirmed,
          when,
          {
            paymentRefHash: String(a.paymentRefHash),
          },
        );
        if (slots !== null) {
          await m
            .createQueryBuilder()
            .update(Project)
            .set({
              reservedSlots: () => `"reserved_slots" - ${slots}`,
              issuedSlots: () => `"issued_slots" + ${slots}`,
            })
            .where('id = :id', { id: toUuid(a.projectId) })
            .execute();
        }
        return;
      }

      case 'ReservationExpired':
      case 'ReservationCancelled': {
        const status =
          event.eventName === 'ReservationExpired'
            ? ReservationStatus.Expired
            : ReservationStatus.Cancelled;
        const slots = await this.close(
          m,
          Number(a.reservationId),
          status,
          when,
        );
        if (slots !== null) {
          await m.decrement(
            Project,
            { id: toUuid(a.projectId)! },
            'reservedSlots',
            slots,
          );
        }
        return;
      }

      case 'RefundsRequired': {
        const id = toUuid(a.projectId);
        if (id)
          await m.update(
            Project,
            { id },
            { refundTotal: BigInt(String(a.totalRefund)) },
          );
        return;
      }

      case 'RefundRecorded': {
        const projectId = toUuid(a.projectId);
        const investorId = toUuid(a.investorId);
        if (!projectId || !investorId) return;
        const hash = String(a.paymentRefHash);
        const updated = await m.update(
          Refund,
          { projectId, investorId, paymentRefHash: hash },
          { confirmed: true },
        );
        if (updated.affected === 0) {
          // Recorded outside this backend: keep the fact, without a readable reference.
          const amount = await this.holdingValue(m, projectId, investorId);
          if (amount === null) return this.unknown(event, projectId);
          if (amount === 0n) {
            // The ledger only refunds holders: no holding here means drift.
            this.logger.error(
              `Refund recorded for ${investorId} on project ${projectId}, who holds no slots here`,
            );
            return;
          }
          await m
            .createQueryBuilder()
            .insert()
            .into(Refund)
            .values({
              projectId,
              investorId,
              amount,
              paymentRefEnc: null,
              paymentRefHash: hash,
              confirmed: true,
              recordedById: null,
              recordedAt: when,
            })
            .orIgnore()
            .execute();
        }
        return;
      }
    }
  }

  /**
   * pending -> a final status, in one conditional statement. Returns the
   * reservation's slots if this call made the change, null if it was already
   * done (a repeated event) or the row is unknown.
   */
  private async close(
    m: EntityManager,
    id: number,
    status: ReservationStatus,
    when: Date,
    extra: Partial<Reservation> = {},
  ): Promise<number | null> {
    const res = await m
      .createQueryBuilder()
      .update(Reservation)
      .set({ status, closedAt: when, ...extra })
      .where('id = :id AND status = :pending', {
        id,
        pending: ReservationStatus.Pending,
      })
      .returning(['slots'])
      .execute();
    const row = (res.raw as Array<{ slots: number }>)[0];
    return row ? Number(row.slots) : null;
  }

  /**
   * What a cancelled project owes an investor: their confirmed slots times the
   * slot price. Null when the project is unknown here.
   */
  private async holdingValue(
    m: EntityManager,
    projectId: string,
    investorId: string,
  ): Promise<bigint | null> {
    const [row] = (await m.query(
      `SELECT COALESCE(SUM(r.slots), 0)::bigint * p.slot_price AS amount
         FROM projects p
         LEFT JOIN reservations r
           ON r.project_id = p.id AND r.investor_id = $2 AND r.status = 'confirmed'
        WHERE p.id = $1
        GROUP BY p.slot_price`,
      [projectId, investorId],
    )) as Array<{ amount: string }>;
    return row ? BigInt(row.amount) : null;
  }

  private unknown(event: LedgerEvent, id: string): void {
    this.logger.debug(
      `${event.eventName} for project ${id} with no row; ignored`,
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
