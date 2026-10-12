import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { bytes32ToUuid, ZERO_BYTES32 } from '../../blockchain/utils/ids';
import { FieldRecord } from './entities/field-record.entity';

/**
 * Marks field records as on the ledger when FieldRecordLog records them.
 * A one-way change (submitted -> recorded), so applying the event twice is
 * harmless. The fingerprints on the ledger must be the ones stored here.
 */
@Injectable()
export class FieldRecordLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(FieldRecordLedgerSync.name);

  constructor(private readonly handlers: EventHandlerRegistry) {}

  onModuleInit(): void {
    this.handlers.on('FieldRecordLog', 'EntryAdded', (e, m) =>
      this.apply(e, m),
    );
    this.handlers.onReset(async (m) => {
      await m
        .createQueryBuilder()
        .update(FieldRecord)
        .set({ status: 'submitted', recordedAt: null, txHash: null })
        .execute();
    });
  }

  async apply(event: ChainEvent, m: EntityManager): Promise<void> {
    let id: string;
    try {
      id = bytes32ToUuid(String(event.args.entryId));
    } catch {
      return;
    }
    const row = await m.findOne(FieldRecord, {
      where: { id },
      select: { id: true, dataHash: true, photoHash: true },
    });
    if (!row) return;
    const ledgerPhoto = String(event.args.photoHash);
    if (
      row.dataHash !== event.args.dataHash ||
      (row.photoHash ?? ZERO_BYTES32) !== ledgerPhoto
    ) {
      this.logger.error(
        `Ledger fingerprints of field record ${id} differ from the database`,
      );
    }
    await m.update(
      FieldRecord,
      { id, status: 'submitted' },
      {
        status: 'recorded',
        recordedAt: event.blockTime ?? new Date(),
        txHash: event.txHash.trim(),
      },
    );
  }
}
