import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid, ZERO_BYTES32 } from '../../blockchain/utils/ids';

/**
 * Keeps banks, bank officers, track records, consents and the view log in
 * step with ConsentRegistry. Changes are guarded by the event's (block, log)
 * position or are one-way, so applying an event twice changes nothing; a
 * rebuild keeps the stored summaries and evidence and replays the rest.
 */
@Injectable()
export class TrackRecordLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(TrackRecordLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of [
      'BankRegistered',
      'BankOfficerAssigned',
      'TrackRecordPublished',
      'ConsentGranted',
      'ConsentRevoked',
      'SummaryViewed',
    ]) {
      this.handlers.on('ConsentRegistry', name, (e, m) => this.apply(e, m));
    }
    this.handlers.onReset(async (m) => {
      await m.query(`UPDATE "banks" SET "status" = 'submitted'`);
      await m.query(
        `UPDATE "bank_officers" SET "bank_id" = NULL, "chain_event_block" = -1, "chain_event_log" = -1`,
      );
      await m.query(
        `UPDATE "track_records" SET "status" = 'submitted', "version" = NULL, "published_at" = NULL`,
      );
      await m.query(
        `UPDATE "bank_consents" SET "status" = 'submitted', "granted_at" = NULL, "revoked_at" = NULL,
                "revoked_by_id" = NULL, "chain_event_block" = -1, "chain_event_log" = -1`,
      );
      await m.query(`DELETE FROM "summary_views"`);
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    const at = [event.blockNumber, event.logIndex];
    switch (event.eventName) {
      case 'BankRegistered': {
        const id = toUuid(a.bankId);
        if (!id) return;
        const [row] = await m.query<Array<{ details_hash: string }>>(
          `SELECT "details_hash" FROM "banks" WHERE "id" = $1`,
          [id],
        );
        if (row && row.details_hash !== a.detailsHash) {
          this.logger.error(
            `Ledger fingerprint of bank ${id} differs from the database`,
          );
        }
        await m.query(
          `UPDATE "banks" SET "status" = 'registered' WHERE "id" = $1 AND "status" = 'submitted'`,
          [id],
        );
        return;
      }

      case 'BankOfficerAssigned': {
        const officerId = toUuid(a.officerId);
        if (!officerId) return;
        const bankId = a.bankId === ZERO_BYTES32 ? null : toUuid(a.bankId);
        await m.query(
          `INSERT INTO "bank_officers" ("officer_id", "bank_id", "chain_event_block", "chain_event_log", "updated_at")
           SELECT $1, $2::uuid, $3, $4, now()
            WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = $1)
              AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM "banks" WHERE "id" = $2::uuid))
           ON CONFLICT ("officer_id") DO UPDATE
             SET "bank_id" = EXCLUDED."bank_id",
                 "chain_event_block" = EXCLUDED."chain_event_block",
                 "chain_event_log" = EXCLUDED."chain_event_log",
                 "updated_at" = now()
           WHERE ("bank_officers"."chain_event_block", "bank_officers"."chain_event_log") < ($3, $4)`,
          [officerId, bankId, ...at],
        );
        return;
      }

      case 'TrackRecordPublished': {
        const farmerId = toUuid(a.farmerId);
        if (!farmerId) return;
        const res = await m.query<[unknown[], number]>(
          `UPDATE "track_records" SET "status" = 'recorded', "version" = $3, "published_at" = $4
            WHERE "farmer_id" = $1 AND "summary_hash" = $2 AND "status" = 'submitted'`,
          [farmerId, String(a.summaryHash), Number(a.version), when],
        );
        if (res[1] === 0) {
          this.logger.debug(
            `Track record v${String(a.version)} of ${farmerId}: unknown or already applied`,
          );
        }
        return;
      }

      case 'ConsentGranted': {
        const farmerId = toUuid(a.farmerId);
        const bankId = toUuid(a.bankId);
        if (!farmerId || !bankId) return;
        const [granted] = await m.query<[Array<{ expires_at: Date }>, number]>(
          `UPDATE "bank_consents"
              SET "status" = 'active', "granted_at" = $3, "chain_event_block" = $4, "chain_event_log" = $5
            WHERE "evidence_hash" = $1 AND "farmer_id" = $2 AND "status" = 'submitted'
            RETURNING "expires_at"`,
          [String(a.evidenceHash), farmerId, when, ...at],
        );
        if (granted.length === 0) {
          this.logger.warn(
            `Consent of ${farmerId} for bank ${bankId}: unknown evidence; ignored`,
          );
          return;
        }
        if (granted[0].expires_at.getTime() / 1000 !== Number(a.expiresAt)) {
          this.logger.error(
            `Ledger expiry of a consent of ${farmerId} differs from the database`,
          );
        }
        // A renewal takes the place of the earlier grant for the same bank.
        await m.query(
          `UPDATE "bank_consents" SET "status" = 'replaced'
            WHERE "farmer_id" = $1 AND "bank_id" = $2 AND "status" = 'active'
              AND ("chain_event_block", "chain_event_log") < ($3, $4)`,
          [farmerId, bankId, ...at],
        );
        return;
      }

      case 'ConsentRevoked': {
        const farmerId = toUuid(a.farmerId);
        const bankId = toUuid(a.bankId);
        if (!farmerId || !bankId) return;
        await m.query(
          `UPDATE "bank_consents"
              SET "status" = 'revoked', "revoked_at" = $3, "revoked_by_id" = $4,
                  "chain_event_block" = $5, "chain_event_log" = $6
            WHERE "farmer_id" = $1 AND "bank_id" = $2 AND "status" = 'active'
              AND ("chain_event_block", "chain_event_log") < ($5, $6)`,
          [farmerId, bankId, when, toUuid(a.revokedBy), ...at],
        );
        return;
      }

      case 'SummaryViewed': {
        const farmerId = toUuid(a.farmerId);
        const bankId = toUuid(a.bankId);
        const viewerId = toUuid(a.viewerId);
        if (!farmerId || !bankId || !viewerId) return;
        await m.query(
          `INSERT INTO "summary_views" ("block_number", "log_index", "farmer_id", "bank_id", "viewer_id", "version", "viewed_at")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [...at, farmerId, bankId, viewerId, Number(a.version), when],
        );
        return;
      }
    }
  }
}

function toUuid(value: unknown): string | null {
  try {
    return typeof value === 'string' ? bytes32ToUuid(value) : null;
  } catch {
    return null;
  }
}
