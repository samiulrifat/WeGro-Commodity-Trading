import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { KeyService } from '../../../blockchain/keys/key.service';
import { bytes32ToUuid, uuidToBytes32 } from '../../../blockchain/utils/ids';
import { Paginated } from '../../../common/dto/pagination.dto';
import { ProjectViews } from '../../projects/project-views';
import { User } from '../../users/entities/user.entity';
import type {
  ActivityEntryDto,
  ActivityQueryDto,
  HistoryActorDto,
  HistoryEntryDto,
  HistoryQueryDto,
} from '../dto/audit.dto';
import {
  addressesIn,
  PARTY_KEYS,
  readableArgs,
  SYSTEM_EVENTS,
  titleOf,
} from './event-format';
import {
  HISTORY_TYPE_NAMES,
  HISTORY_TYPES,
  type HistoryTypeName,
  type IdKind,
} from './history-types';
import { ErrorCode } from '../../../common/errors/error-code';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32 = /^0x[0-9a-f]{64}$/i;
const NUMBER = /^\d{1,20}$/;

interface Row {
  block_number: string;
  log_index: number;
  block_time: Date;
  tx_hash: string;
  tx_from: string | null;
  contract: string;
  event_name: string;
  args: Record<string, unknown>;
}

/**
 * A record's full history from the indexed ledger events: every event that
 * names it, oldest first, with who sent each transaction. One GIN-indexed
 * lookup per page, then one query each for actors and names.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly keys: KeyService,
    private readonly views: ProjectViews,
  ) {}

  async history(
    type: HistoryTypeName,
    id: string,
    q: HistoryQueryDto,
  ): Promise<Paginated<HistoryEntryDto>> {
    const def = HISTORY_TYPES[type];
    const value = ledgerValue(def.kind, id);
    const params: unknown[] = [];
    const conditions = def.sources.flatMap((source) =>
      source.keys.map((key) => {
        params.push(
          JSON.stringify({ [key]: key.endsWith('Ids') ? [value] : value }),
        );
        const match = `args @> $${params.length}::jsonb`;
        if (!source.contract) return match;
        params.push(source.contract);
        return `(contract = $${params.length} AND ${match})`;
      }),
    );
    const where = conditions.join(' OR ');
    const order = q.order === 'desc' ? 'DESC' : 'ASC';
    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query<Row[]>(
        `SELECT block_number, log_index, block_time, tx_hash, tx_from, contract, event_name, args
           FROM chain_event WHERE ${where}
          ORDER BY block_number ${order}, log_index ${order}
          LIMIT ${q.limit} OFFSET ${q.skip}`,
        params,
      ),
      this.dataSource.query<Array<{ total: string }>>(
        `SELECT COUNT(*) AS total FROM chain_event WHERE ${where}`,
        params,
      ),
    ]);
    return new Paginated(await this.entries(rows), Number(total), q);
  }

  /**
   * Ledger activity, newest first: every indexed event, or those naming a
   * kind of record, or naming one record by its number or id (of any kind
   * when no kind is given). Each with the records it names, to open their
   * histories. The same GIN index serves every filter.
   */
  async activity(q: ActivityQueryDto): Promise<Paginated<ActivityEntryDto>> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const text = q.q?.trim();
    // Nothing to filter on: every event.
    const types = q.type ? [q.type] : text ? HISTORY_TYPE_NAMES : [];
    for (const type of types) {
      const def: { kind: IdKind; sources: readonly Source[] } =
        HISTORY_TYPES[type];
      const value = text ? asLedgerValue(def.kind, text) : null;
      if (text && value === null) continue; // cannot be this kind's id
      for (const source of def.sources) {
        for (const key of source.keys) {
          if (value !== null) {
            params.push(
              JSON.stringify({ [key]: key.endsWith('Ids') ? [value] : value }),
            );
          } else {
            params.push(key);
          }
          const match =
            value !== null
              ? `args @> $${params.length}::jsonb`
              : `args ? $${params.length}`;
          if (!source.contract) {
            conditions.push(match);
          } else {
            params.push(source.contract);
            conditions.push(`(contract = $${params.length} AND ${match})`);
          }
        }
      }
    }
    // A search no kind can match: nothing.
    const where =
      !q.type && !text
        ? 'TRUE'
        : conditions.length > 0
          ? conditions.join(' OR ')
          : 'FALSE';
    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query<Row[]>(
        `SELECT block_number, log_index, block_time, tx_hash, tx_from, contract, event_name, args
           FROM chain_event WHERE ${where}
          ORDER BY block_number DESC, log_index DESC
          LIMIT ${q.limit} OFFSET ${q.skip}`,
        params,
      ),
      this.dataSource.query<Array<{ total: string }>>(
        `SELECT COUNT(*) AS total FROM chain_event WHERE ${where}`,
        params,
      ),
    ]);
    const entries = await this.entries(rows);
    return new Paginated(
      entries.map((e, i) => Object.assign(e, { records: recordsIn(rows[i]) })),
      Number(total),
      q,
    );
  }

  private async entries(rows: Row[]): Promise<HistoryEntryDto[]> {
    const readable = rows.map((r) => readableArgs(r.contract, r.args));
    const addresses = rows.flatMap((r) => [
      ...(r.tx_from ? [r.tx_from] : []),
      ...addressesIn(r.args),
    ]);
    const partyIds = readable.flatMap((args) =>
      Object.entries(args).flatMap(([k, v]) =>
        PARTY_KEYS.has(k) ? [v].flat().filter(isUuid) : [],
      ),
    );
    const actors = await this.actors(addresses);
    const names = await this.views.names([
      ...partyIds,
      ...[...actors.values()].map((a) => a.id),
    ]);
    const operator = this.keys.operatorAddress();
    return rows.map((r, i) => {
      const args = readable[i];
      const parties = Object.fromEntries(
        Object.entries(args)
          .flatMap(([k, v]) =>
            PARTY_KEYS.has(k) ? [v].flat().filter(isUuid) : [],
          )
          .map((id) => [id, names.get(id) ?? ''] as const),
      );
      // Addresses in the arguments are shown as the people behind them.
      for (const a of addressesIn(r.args)) {
        const who = actors.get(a);
        if (who) parties[a] = names.get(who.id) ?? '';
      }
      return {
        at: r.block_time,
        blockNumber: Number(r.block_number),
        logIndex: r.log_index,
        txHash: r.tx_hash.trim(),
        contract: r.contract,
        event: r.event_name,
        title: titleOf(r.event_name),
        actor: this.actorView(r, actors, names, operator),
        details: args,
        parties,
      };
    });
  }

  private actorView(
    r: Row,
    actors: Map<string, { id: string; role: string }>,
    names: Map<string, string>,
    operator: string,
  ): HistoryActorDto {
    if (!r.tx_from) return { kind: 'unknown', address: null };
    if (r.tx_from === operator && SYSTEM_EVENTS.has(r.event_name)) {
      return { kind: 'system', address: r.tx_from, name: 'System' };
    }
    const who = actors.get(r.tx_from);
    return who
      ? {
          kind: 'participant',
          address: r.tx_from,
          id: who.id,
          name: names.get(who.id) ?? '',
          role: who.role,
        }
      : { kind: 'unknown', address: r.tx_from };
  }

  /**
   * Address -> participant. Current keys from the users table; keys since
   * replaced from the registration and key-change events.
   */
  private async actors(
    addresses: string[],
  ): Promise<Map<string, { id: string; role: string }>> {
    const unique = [...new Set(addresses)];
    if (unique.length === 0) return new Map();
    const current = await this.users.find({
      where: { account: In(unique) },
      select: { id: true, account: true, role: true },
    });
    const found = new Map(
      current.map((u) => [u.account, { id: u.id, role: u.role as string }]),
    );
    const missing = unique.filter((a) => !found.has(a));
    if (missing.length === 0) return found;
    const past = await this.dataSource.query<
      Array<{ address: string; participant: string; role: string | null }>
    >(
      `SELECT a.address, e.args->>'participantId' AS participant, u.role
         FROM chain_event e
        CROSS JOIN LATERAL (VALUES (e.args->>'account'), (e.args->>'previousAccount'),
                                   (e.args->>'newAccount')) AS a(address)
         LEFT JOIN users u
           ON '0x' || repeat('0', 32) || replace(u.id::text, '-', '') = e.args->>'participantId'
        WHERE e.contract = 'AccessRegistry'
          AND e.event_name IN ('ParticipantRegistered', 'ParticipantAccountChanged')
          AND a.address = ANY($1)`,
      [missing],
    );
    for (const p of past) {
      if (!found.has(p.address)) {
        found.set(p.address, {
          id: bytes32ToUuid(p.participant),
          role: p.role ?? 'unknown',
        });
      }
    }
    return found;
  }
}

/** The record id as it appears in event arguments; 404 for an id that cannot be one. */
function ledgerValue(kind: 'uuid' | 'number' | 'bytes32', id: string): string {
  switch (kind) {
    case 'uuid':
      if (!UUID.test(id))
        throw new NotFoundException({
          message: 'Record not found',
          code: ErrorCode.RECORD_NOT_FOUND,
        });
      return uuidToBytes32(id);
    case 'number':
      if (!NUMBER.test(id))
        throw new NotFoundException({
          message: 'Record not found',
          code: ErrorCode.RECORD_NOT_FOUND,
        });
      return BigInt(id).toString();
    case 'bytes32':
      if (!BYTES32.test(id))
        throw new NotFoundException({
          message: 'Record not found',
          code: ErrorCode.RECORD_NOT_FOUND,
        });
      return id.toLowerCase();
  }
}

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID.test(v);

interface Source {
  contract: string | null;
  keys: readonly string[];
}

/** `id` as a ledger argument of this kind, or null if it cannot be one. */
function asLedgerValue(kind: IdKind, id: string): string | null {
  try {
    return ledgerValue(kind, id);
  } catch {
    return null;
  }
}

/** A ledger argument back as the record id the API uses. */
function recordId(kind: IdKind, value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const v = String(value);
  try {
    if (kind === 'uuid') return BYTES32.test(v) ? bytes32ToUuid(v) : null;
    if (kind === 'number') return NUMBER.test(v) && v !== '0' ? v : null;
    return BYTES32.test(v) && !/^0x0{64}$/.test(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The records an event names, by kind, each once. */
function recordsIn(r: Row): Array<{ type: HistoryTypeName; id: string }> {
  const out = new Map<string, { type: HistoryTypeName; id: string }>();
  for (const type of HISTORY_TYPE_NAMES) {
    const def: { kind: IdKind; sources: readonly Source[] } =
      HISTORY_TYPES[type];
    for (const source of def.sources) {
      if (source.contract && source.contract !== r.contract) continue;
      for (const key of source.keys) {
        for (const raw of [r.args[key]].flat()) {
          const id = recordId(def.kind, raw);
          if (id) out.set(`${type}:${id}`, { type, id });
        }
      }
    }
  }
  return [...out.values()];
}
