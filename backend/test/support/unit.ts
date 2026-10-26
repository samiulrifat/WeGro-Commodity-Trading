/**
 * Small fakes for service unit tests: people, repositories, config and a
 * transaction service that records what was asked of the ledger. Services
 * take their collaborators by constructor, so a spec builds the service with
 * these and checks its own decisions: who may act, which states it refuses,
 * what it stores, and in which order it talks to the database and the chain.
 */
import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { ContractRevertException } from '../../src/blockchain/errors/contract-errors';
import type { DecodedEvent } from '../../src/blockchain/tx/transaction.service';
import type { AuthUser } from '../../src/modules/auth/auth-user';
import { CodeList, type ListEntry } from '../../src/modules/catalog/code-list';
import { ChainState } from '../../src/modules/users/entities/user.entity';
import { ParticipantStatus, Role } from '../../src/modules/users/roles';

export type Mocked = jest.Mock<Promise<unknown>, unknown[]>;

/** A verified, confirmed person in `role` (override any field). */
export function actor(role: Role, over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: randomUUID(),
    role,
    status: ParticipantStatus.VERIFIED,
    chainState: ChainState.CONFIRMED,
    keyIndex: 1000 + Math.floor(Math.random() * 1000),
    mustChangePassword: false,
    ...over,
  };
}

/** ConfigService over a plain object. */
export function config(values: Record<string, unknown>) {
  return {
    get: (key: string) => {
      if (!(key in values)) throw new Error(`config ${key} not set in test`);
      return values[key];
    },
  } as never;
}

/**
 * Repository (or EntityManager) whose methods are jest mocks. By default
 * reads find nothing and writes touch one row; override per test.
 */
export function fakeRepo(over: Record<string, unknown> = {}) {
  const repo: Record<string, jest.Mock> = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    insert: jest.fn(() => Promise.resolve({ identifiers: [], raw: [] })),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    increment: jest.fn(() => Promise.resolve({ affected: 1 })),
    find: jest.fn(() => Promise.resolve([])),
    findBy: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    findOneBy: jest.fn(() => Promise.resolve(null)),
    findOneOrFail: jest.fn(() => Promise.reject(new Error('not found'))),
    findOneByOrFail: jest.fn(() => Promise.reject(new Error('not found'))),
    count: jest.fn(() => Promise.resolve(0)),
    countBy: jest.fn(() => Promise.resolve(0)),
    exists: jest.fn(() => Promise.resolve(false)),
    existsBy: jest.fn(() => Promise.resolve(false)),
    query: jest.fn(() => Promise.resolve([])),
  };
  Object.assign(repo, over);
  return repo;
}

/** DataSource whose transaction() runs the work on `manager` right away. */
export function fakeDataSource(
  manager = fakeRepo(),
  over: Record<string, unknown> = {},
) {
  return {
    manager,
    transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
    query: jest.fn(() => Promise.resolve([])),
    getRepository: jest.fn(() => manager),
    ...over,
  };
}

/**
 * Chainable query builder: every clause returns the builder and is recorded
 * as [method, ...args]; the terminal calls resolve to what `results` gives
 * (an Error there makes the call reject).
 */
export function fakeQueryBuilder(results: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const terminal = new Set([
    'getMany',
    'getOne',
    'getRawMany',
    'getRawOne',
    'getManyAndCount',
    'getCount',
    'getExists',
    'execute',
  ]);
  const qb: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (method === 'then') return undefined; // not a promise
        return (...args: unknown[]) => {
          calls.push([method, ...args]);
          if (terminal.has(method)) {
            const value =
              method in results ? results[method] : defaults[method];
            // An Error makes that call fail, as the database would.
            return value instanceof Error
              ? Promise.reject(value)
              : Promise.resolve(value);
          }
          return qb;
        };
      },
    },
  );
  const defaults: Record<string, unknown> = {
    getMany: [],
    getOne: null,
    getRawMany: [],
    getRawOne: undefined,
    getManyAndCount: [[], 0],
    getCount: 0,
    getExists: false,
    execute: { affected: 1, raw: [] },
  };
  return {
    qb,
    calls,
    /** The SQL fragments given to where/andWhere/orWhere, in order. */
    wheres: () =>
      calls
        .filter(([m]) => /^(where|andWhere|orWhere)$/.test(m as string))
        .map(([, c]) => c),
  };
}

export interface SentCall {
  signer: number;
  contract: string;
  method: string;
  args: unknown[];
}

/**
 * TransactionService that records each call (who signed, which contract,
 * method and arguments) instead of sending it. `events` decides what a call
 * "emitted"; `fail` makes the next call throw.
 */
export function fakeTx(events: (call: SentCall) => DecodedEvent[] = () => []) {
  const sent: SentCall[] = [];
  const failures: Error[] = [];
  const send = jest.fn(
    async (
      signer: number,
      contract: string,
      build: (c: unknown) => Promise<{ method: string; args: unknown[] }>,
    ) => {
      const contractProxy = new Proxy(
        {},
        {
          get: (_t, method: string) => ({
            populateTransaction: (...args: unknown[]) =>
              Promise.resolve({ method, args }),
          }),
        },
      );
      const { method, args } = await build(contractProxy);
      const call = { signer, contract, method, args };
      const failure = failures.shift();
      if (failure) throw failure;
      sent.push(call);
      return {
        hash: `0x${String(sent.length).padStart(64, '0')}`,
        blockNumber: sent.length,
        blockTime: new Date('2026-10-14T00:00:00Z'),
        gasUsed: 21_000n,
        from: `0x${'0'.repeat(40)}`,
        events: events(call),
      };
    },
  );
  return {
    tx: { send, ensureFunded: jest.fn(() => Promise.resolve(false)) },
    sent,
    /** Methods called, in order. */
    methods: () => sent.map((c) => c.method),
    fail: (error: Error) => failures.push(error),
  };
}

/** What the transaction service throws when the contract refuses a call. */
export function revert(name: string, args: Record<string, unknown> = {}) {
  return new ContractRevertException({ name, args } as never);
}

/** A database unique-violation, as TypeORM throws it. */
export function uniqueViolation() {
  return new QueryFailedError('INSERT ...', [], {
    code: '23505',
  } as unknown as Error);
}

/**
 * Does `row` satisfy a TypeORM `where` object? Plain values compare equal;
 * the operators services use here (In, IsNull, Not) are understood.
 */
export function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([k, v]) => {
    const value = row[k];
    if (v && typeof v === 'object' && '_type' in v) {
      const op = v as { _type: string; _value: unknown };
      if (op._type === 'in') return (op._value as unknown[]).includes(value);
      if (op._type === 'isNull') return value === null || value === undefined;
      if (op._type === 'not') {
        return !matchesWhere(row, { [k]: op._value });
      }
      throw new Error(`operator ${op._type} not supported in tests`);
    }
    return value === v;
  });
}

/**
 * IdentityCryptoService stand-in: readable "encryption" bound to its
 * context, so a value opened under the wrong context fails like the real one.
 */
export function fakeCrypto() {
  return {
    encrypt: jest.fn((text: string, ctx: string) => `enc[${ctx}]${text}`),
    decrypt: jest.fn((enc: string, ctx: string) => {
      const prefix = `enc[${ctx}]`;
      if (!enc.startsWith(prefix)) throw new Error('wrong context');
      return enc.slice(prefix.length);
    }),
  };
}

/** The chain's clock, fixed at `now`. */
export function fakeClock(now = new Date('2026-10-14T06:00:00Z')) {
  return { now: jest.fn(() => Promise.resolve(now)), forget: jest.fn() };
}

type Entry = Partial<ListEntry> & Record<string, unknown>;
const list = (label: string, entries: Entry[]) => {
  const l = new CodeList<ListEntry>(label);
  l.load(
    entries.map((e) => ({
      name: String(e.code),
      nameBn: String(e.code),
      active: true,
      sortOrder: 0,
      ...e,
    })) as ListEntry[],
  );
  return l;
};

/**
 * CatalogService with real in-memory lists: kg, a few crops and inputs, one
 * retired crop (OLDCROP). Pass entries to replace a list.
 */
export function fakeCatalog(over: Record<string, Entry[]> = {}) {
  return {
    units: list('unit', over.units ?? [{ code: 'KG', symbol: 'kg' }]),
    produceTypes: list(
      'produce type',
      over.produceTypes ?? [
        { code: 'MAIZE', unitCode: 'KG', category: 'grain' },
        { code: 'POTATO', unitCode: 'KG', category: 'vegetable' },
        { code: 'OLDCROP', unitCode: 'KG', category: 'grain', active: false },
      ],
    ),
    inputTypes: list(
      'input type',
      over.inputTypes ?? [
        { code: 'UREA', unitCode: 'KG', kind: 'fertiliser' },
        { code: 'SEED_MAIZE', unitCode: 'KG', kind: 'seed' },
      ],
    ),
    fieldRecordTypes: list(
      'field record type',
      over.fieldRecordTypes ?? [{ code: 'SOWING', requiresPhoto: true }],
    ),
    weatherEventTypes: list(
      'weather event type',
      over.weatherEventTypes ?? [{ code: 'FLOOD' }],
    ),
  };
}

export { Role, ParticipantStatus, ChainState };
