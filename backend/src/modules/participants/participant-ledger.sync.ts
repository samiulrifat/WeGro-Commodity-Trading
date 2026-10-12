import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { getAddress } from 'ethers';
import { type EntityManager } from 'typeorm';
import { EventHandlerRegistry } from '../../blockchain/indexer/event-handler.registry';
import { KeyService } from '../../blockchain/keys/key.service';
import { bytes32ToUuid } from '../../blockchain/utils/ids';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { ChainState, User } from '../users/entities/user.entity';
import {
  ParticipantStatus,
  Role,
  ROLE_BY_CHAIN_ID,
  STATUS_BY_CHAIN,
} from '../users/roles';

/** One AccessRegistry event, from a receipt or from the indexer. */
export interface LedgerEvent {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  blockTime?: Date;
}

const EVENTS = [
  'ParticipantRegistered',
  'ParticipantStatusChanged',
  'FieldOfficerAssigned',
  'ParticipantAccountChanged',
  'ParticipantDetailsUpdated',
] as const;

/**
 * Keeps `users` in step with AccessRegistry, the source of truth for status,
 * account and field officer.
 *
 * Each event is applied twice: straight from the transaction receipt (so the
 * API answers with the new state at once) and again by the indexer (which
 * also catches changes made by anyone else). Both use `apply`, guarded by the
 * event's position (block, log index): an event never overwrites a newer one,
 * and applying the same event again gives the same row. Each apply is one
 * primary-key update.
 */
@Injectable()
export class ParticipantLedgerSync implements OnModuleInit {
  private readonly logger = new Logger(ParticipantLedgerSync.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly keys: KeyService,
  ) {}

  onModuleInit(): void {
    for (const name of EVENTS) {
      this.handlers.on('AccessRegistry', name, (event, manager) =>
        this.apply(event, manager),
      );
    }
    // Full re-index: forget what the ledger told us; the replay restores it.
    // Until then nobody counts as registered, so no stale verification is trusted.
    this.handlers.onReset(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(User)
        .set({
          chainState: ChainState.Submitted,
          status: ParticipantStatus.Pending,
          fieldOfficerId: null,
          chainEventBlock: -1,
          chainEventLog: -1,
        })
        .where('role <> :operator', { operator: Role.SuperAdmin })
        .execute();
    });
  }

  async apply(event: LedgerEvent, manager: EntityManager): Promise<void> {
    const subject =
      event.eventName === 'FieldOfficerAssigned'
        ? event.args.farmerId
        : event.args.participantId;
    const userId = toUuid(subject);
    if (!userId) {
      this.logger.warn(`${event.eventName} for a non-platform id; ignored`);
      return;
    }

    const patch = await this.patchFor(event, userId, manager);
    if (!patch) return;

    const updated = await manager
      .createQueryBuilder()
      .update(User)
      .set({
        ...patch,
        chainEventBlock: event.blockNumber,
        chainEventLog: event.logIndex,
      })
      .where('id = :id', { id: userId })
      .andWhere('role <> :operator', { operator: Role.SuperAdmin })
      // Not older than what is already applied.
      .andWhere('(chain_event_block, chain_event_log) <= (:block, :log)', {
        block: event.blockNumber,
        log: event.logIndex,
      })
      .execute();
    if (updated.affected === 0) {
      const exists = await manager.exists(User, { where: { id: userId } });
      if (!exists) {
        // Registered outside this database (e.g. by a test run on a shared
        // local chain); nothing to mirror.
        this.logger.debug(
          `${event.eventName} for participant ${userId} with no user row`,
        );
      }
    }
  }

  private async patchFor(
    event: LedgerEvent,
    userId: string,
    manager: EntityManager,
  ): Promise<Partial<User> | null> {
    const a = event.args;
    switch (event.eventName) {
      case 'ParticipantRegistered': {
        await this.checkRegistration(event, userId, manager);
        return {
          chainState: ChainState.Confirmed,
          account: getAddress(String(a.account)),
          registrationTx: event.txHash,
        };
      }
      case 'ParticipantStatusChanged': {
        const status = STATUS_BY_CHAIN[Number(a.newStatus)];
        if (!status) return null;
        return { status, statusChangedAt: event.blockTime ?? new Date() };
      }
      case 'FieldOfficerAssigned':
        return { fieldOfficerId: toUuid(a.officerId) };
      case 'ParticipantAccountChanged': {
        const account = getAddress(String(a.newAccount));
        const row = await manager.findOne(User, {
          where: { id: userId },
          select: { id: true, pendingKeyIndex: true },
        });
        // The key we asked for is now on-chain: switch to it.
        if (
          row?.pendingKeyIndex != null &&
          this.keys.addressOf(row.pendingKeyIndex) === account
        ) {
          return {
            account,
            keyIndex: row.pendingKeyIndex,
            pendingKeyIndex: null,
          };
        }
        return { account };
      }
      case 'ParticipantDetailsUpdated':
        // Details corrections are not offered yet; only the position moves.
        return {};
      default:
        return null;
    }
  }

  /** The ledger must hold exactly what we registered: same role, same fingerprint. */
  private async checkRegistration(
    event: LedgerEvent,
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    const [user, details] = await Promise.all([
      manager.findOne(User, {
        where: { id: userId },
        select: { id: true, role: true },
      }),
      manager.findOne(PersonalDetails, {
        where: { userId },
        select: { userId: true, detailsHash: true },
      }),
    ]);
    if (!user) return;
    const role = ROLE_BY_CHAIN_ID.get(String(event.args.role));
    if (role !== user.role || details?.detailsHash !== event.args.detailsHash) {
      this.logger.error(
        `Ledger registration of ${userId} does not match the database (role or details fingerprint)`,
      );
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
