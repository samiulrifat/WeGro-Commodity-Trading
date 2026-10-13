import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid } from '../../blockchain/utils/ids';
import { CoverageTerms } from './entities/coverage-terms.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { WeatherEvent } from './entities/weather-event.entity';
import { CLAIM_STATUS_BY_CHAIN, ClaimStatus } from './insurance.enums';

/**
 * Keeps cover versions, weather events and claims in step with
 * InsuranceRegistry. Changes are guarded by the event's (block, log)
 * position or are one-way, so applying an event twice changes nothing.
 * The ledger's fingerprints must be the ones stored here; a difference is logged.
 */
@Injectable()
export class InsuranceLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(InsuranceLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    for (const name of [
      'CoverageSet',
      'WeatherEventRecorded',
      'ClaimOpened',
      'ClaimStatusChanged',
    ]) {
      this.handlers.on('InsuranceRegistry', name, (e, m) => this.apply(e, m));
    }
    this.handlers.onReset(async (m) => {
      await m.query(
        `UPDATE "coverage_terms" SET "status" = 'submitted', "recorded_at" = NULL, "chain_event_block" = -1, "chain_event_log" = -1`,
      );
      await m.query(
        `UPDATE "weather_events" SET "status" = 'submitted', "recorded_at" = NULL`,
      );
      await m.query(
        `UPDATE "insurance_claims" SET "status" = 'submitted', "approved_amount" = NULL, "decided_at" = NULL,
                "opened_at" = NULL, "chain_event_block" = -1, "chain_event_log" = -1`,
      );
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    const a = event.args;
    const when = event.blockTime ?? new Date();
    switch (event.eventName) {
      case 'CoverageSet': {
        const projectId = toUuid(a.projectId);
        if (!projectId) return;
        const res = await m
          .createQueryBuilder()
          .update(CoverageTerms)
          .set({
            status: 'recorded',
            recordedAt: when,
            chainEventBlock: event.blockNumber,
            chainEventLog: event.logIndex,
          })
          .where('project_id = :projectId AND terms_hash = :hash', {
            projectId,
            hash: String(a.termsHash),
          })
          .andWhere('(chain_event_block, chain_event_log) <= (:b, :l)', {
            b: event.blockNumber,
            l: event.logIndex,
          })
          .execute();
        if (res.affected === 0) {
          this.logger.debug(
            `CoverageSet for project ${projectId}: unknown terms or older; ignored`,
          );
        }
        return;
      }

      case 'WeatherEventRecorded': {
        const id = toUuid(a.eventId);
        if (!id) return;
        const row = await m.findOne(WeatherEvent, {
          where: { id },
          select: { id: true, detailsHash: true },
        });
        if (!row) return;
        if (row.detailsHash !== a.detailsHash) {
          this.logger.error(
            `Ledger fingerprint of weather event ${id} differs from the database`,
          );
        }
        await m.update(
          WeatherEvent,
          { id, status: 'submitted' },
          { status: 'recorded', recordedAt: when },
        );
        return;
      }

      case 'ClaimOpened': {
        const id = toUuid(a.claimId);
        if (!id) return;
        const row = await m.findOne(InsuranceClaim, {
          where: { id },
          select: { id: true, claimHash: true },
        });
        if (!row) return;
        if (row.claimHash !== a.claimHash) {
          this.logger.error(
            `Ledger fingerprint of claim ${id} differs from the database`,
          );
        }
        await this.patch(m, event, id, {
          status: ClaimStatus.Triggered,
          openedAt: when,
        });
        return;
      }

      case 'ClaimStatusChanged': {
        const id = toUuid(a.claimId);
        const status = CLAIM_STATUS_BY_CHAIN[Number(a.status)];
        if (!id || !status) return;
        const decided =
          status === ClaimStatus.Approved || status === ClaimStatus.Rejected;
        if (decided) {
          const row = await m.findOne(InsuranceClaim, {
            where: { id },
            select: { id: true, assessmentHash: true },
          });
          if (!row) return;
          if (row.assessmentHash !== a.assessmentHash) {
            this.logger.error(
              `Ledger fingerprint of the assessment of claim ${id} differs from the database`,
            );
          }
        }
        await this.patch(m, event, id, {
          status,
          ...(status === ClaimStatus.Approved && {
            approvedAmount: BigInt(String(a.approvedAmount)),
          }),
          ...(decided && { decidedAt: when }),
        });
        return;
      }
    }
  }

  private async patch(
    m: EntityManager,
    event: ChainEvent,
    id: string,
    values: Partial<InsuranceClaim>,
  ): Promise<void> {
    await m
      .createQueryBuilder()
      .update(InsuranceClaim)
      .set({
        ...values,
        chainEventBlock: event.blockNumber,
        chainEventLog: event.logIndex,
      })
      .where('id = :id', { id })
      .andWhere('(chain_event_block, chain_event_log) <= (:b, :l)', {
        b: event.blockNumber,
        l: event.logIndex,
      })
      .execute();
  }
}

function toUuid(value: unknown): string | null {
  try {
    return typeof value === 'string' ? bytes32ToUuid(value) : null;
  } catch {
    return null;
  }
}
