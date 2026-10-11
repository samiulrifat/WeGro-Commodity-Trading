/**
 * Blockchain layer against a real node and a real database.
 *
 * Needs the local Hardhat node with the platform deployed (see README) and
 * the database from .env. Each run works in its own throwaway schema, and
 * uses fresh ids and key indexes, so runs never collide on the shared node.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BlockchainModule } from '../src/blockchain/blockchain.module';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { ContractRevertException } from '../src/blockchain/errors/contract-errors';
import { ChainEvent } from '../src/blockchain/indexer/chain-event.entity';
import { EventHandlerRegistry } from '../src/blockchain/indexer/event-handler.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { IndexerState } from '../src/blockchain/indexer/indexer-state.entity';
import { KeyService } from '../src/blockchain/keys/key.service';
import { TransactionService } from '../src/blockchain/tx/transaction.service';
import { fingerprint } from '../src/blockchain/utils/fingerprint';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import {
  type EnvironmentVariables,
  validateEnv,
} from '../src/config/env.validation';
import { SnakeNamingStrategy } from '../src/database/snake-naming.strategy';

const SCHEMA = `chain_test_${process.pid}`;
const OPERATOR = KeyService.OPERATOR_INDEX;

/** A key index no other run will have used: accounts are single-use on chain. */
const freshIndex = () => randomInt(1_000_000, 2 ** 31 - 1);
const freshId = () => uuidToBytes32(randomUUID());
const details = (id: string) => fingerprint('participant', { id });

process.env.INDEXER_ENABLED = 'false';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        synchronize: false,
        migrations: [join(__dirname, '../src/database/migrations/*.ts')],
        migrationsRun: true,
        namingStrategy: new SnakeNamingStrategy(),
        extra: { options: `-c search_path=${SCHEMA}` },
      }),
    }),
    BlockchainModule,
  ],
})
class ChainTestModule {}

describe('Blockchain layer (node + database)', () => {
  let app: INestApplicationContext;
  let contracts: ContractsRegistry;
  let keys: KeyService;
  let tx: TransactionService;
  let indexer: EventIndexerService;
  let handlers: EventHandlerRegistry;
  let db: DataSource;
  let adminRole: string;
  let farmerRole: string;

  /** Registers a participant as the operator (staff roles need the super admin). */
  async function register(id: string, role: string, account: string) {
    return tx.send(OPERATOR, 'AccessRegistry', (c) =>
      c.registerParticipant.populateTransaction(id, role, account, details(id)),
    );
  }

  beforeAll(async () => {
    // Throwaway schema first, so the migrations run inside it.
    const setup = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? readDatabaseUrl(),
    });
    await setup.initialize();
    await setup.query(`CREATE SCHEMA "${SCHEMA}"`);
    await setup.destroy();

    const moduleRef = await Test.createTestingModule({
      imports: [ChainTestModule],
    }).compile();
    moduleRef.useLogger(false);
    app = await moduleRef.init();

    contracts = app.get(ContractsRegistry);
    keys = app.get(KeyService);
    tx = app.get(TransactionService);
    indexer = app.get(EventIndexerService);
    handlers = app.get(EventHandlerRegistry);
    db = app.get(DataSource);

    const access = contracts.get('AccessRegistry');
    [adminRole, farmerRole] = await Promise.all([
      access.ADMIN_ROLE(),
      access.FARMER_ROLE(),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    const teardown = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? readDatabaseUrl(),
    });
    await teardown.initialize();
    await teardown.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await teardown.destroy();
  });

  describe('deployment', () => {
    it('loaded and verified all nine contracts on the configured chain', async () => {
      expect(contracts.all()).toHaveLength(9);
      const codes = await Promise.all(
        contracts.addresses().map((a) => contracts.provider.getCode(a)),
      );
      expect(codes.every((c) => c.length > 2)).toBe(true);
      // The deployer (index 0) is the super admin.
      const access = contracts.get('AccessRegistry');
      await expect(
        access.hasRole(
          await access.DEFAULT_ADMIN_ROLE(),
          keys.operatorAddress(),
        ),
      ).resolves.toBe(true);
    });
  });

  describe('keys', () => {
    it('hands out increasing indexes from the migrated sequence', async () => {
      const a = await keys.allocateIndex();
      const b = await keys.allocateIndex();
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBe(a + 1);
    });
  });

  describe('transactions', () => {
    it('sends as the operator and returns the decoded events', async () => {
      const id = freshId();
      const account = keys.addressOf(freshIndex());
      const result = await register(id, adminRole, account);

      expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.events).toEqual([
        expect.objectContaining({
          contract: 'AccessRegistry',
          name: 'ParticipantRegistered',
        }),
      ]);
      const p = await contracts.get('AccessRegistry').getParticipant(id);
      expect(p.account).toBe(account);
    });

    it('rejects with the decoded contract error, before spending a nonce', async () => {
      const id = freshId();
      await register(id, adminRole, keys.addressOf(freshIndex()));
      const operator = keys.operatorAddress();
      const nonceBefore = await contracts.provider.getTransactionCount(
        operator,
        'pending',
      );

      const error = await register(
        id,
        adminRole,
        keys.addressOf(freshIndex()),
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ContractRevertException);
      const revert = error as ContractRevertException;
      expect(revert.getStatus()).toBe(409);
      expect(revert.getResponse()).toMatchObject({
        code: 'ParticipantAlreadyRegistered',
        message: 'Participant already registered',
        details: { participantId: id },
      });
      await expect(
        contracts.provider.getTransactionCount(operator, 'pending'),
      ).resolves.toBe(nonceBefore);

      // And the key is still usable straight after.
      await register(freshId(), adminRole, keys.addressOf(freshIndex()));
    });

    it('keeps nonces in order under concurrent sends from one key', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          register(freshId(), adminRole, keys.addressOf(freshIndex())),
        ),
      );
      const nonces = await Promise.all(
        results.map(
          async (r) => (await contracts.provider.getTransaction(r.hash))!.nonce,
        ),
      );
      const sorted = [...nonces].sort((a, b) => a - b);
      expect(new Set(nonces).size).toBe(12);
      expect(sorted[11] - sorted[0]).toBe(11);
    });

    it('funds a new key on its first transaction, once', async () => {
      // A verified admin with an empty key registers a farmer.
      const adminIndex = freshIndex();
      const adminAddress = keys.addressOf(adminIndex);
      const adminId = freshId();
      await register(adminId, adminRole, adminAddress);
      await tx.send(OPERATOR, 'AccessRegistry', (c) =>
        c.verifyParticipant.populateTransaction(adminId),
      );
      expect(await contracts.provider.getBalance(adminAddress)).toBe(0n);

      const farmerId = freshId();
      await tx.send(adminIndex, 'AccessRegistry', (c) =>
        c.registerParticipant.populateTransaction(
          farmerId,
          farmerRole,
          keys.addressOf(freshIndex()),
          details(farmerId),
        ),
      );

      expect(await contracts.provider.getBalance(adminAddress)).toBeGreaterThan(
        0n,
      );
      await expect(tx.ensureFunded(adminAddress)).resolves.toBe(false);
      const p = await contracts.get('AccessRegistry').getParticipant(farmerId);
      expect(p.status).toBe(1n); // Pending
    });
  });

  describe('event indexer', () => {
    const seen: string[] = [];
    let failNext = false;

    beforeAll(() => {
      handlers.on('AccessRegistry', 'ParticipantRegistered', async (event) => {
        if (failNext) {
          failNext = false;
          throw new Error('handler failure');
        }
        seen.push(event.txHash);
      });
      handlers.onReset(async () => {
        seen.length = 0;
      });
    });

    const stateOf = () =>
      db.getRepository(IndexerState).findOneByOrFail({ id: 'main' });

    it('stores every platform event up to the chain head', async () => {
      const id = freshId();
      const sent = await register(id, adminRole, keys.addressOf(freshIndex()));
      await indexer.catchUp();

      const head = await contracts.provider.getBlockNumber();
      const state = await stateOf();
      expect(state.lastBlock).toBe(head);
      expect(state.lastBlockHash).toBe(
        (await contracts.provider.getBlock(head))!.hash,
      );

      const stored = await db.getRepository(ChainEvent).findOneByOrFail({
        txHash: sent.hash,
        eventName: 'ParticipantRegistered',
      });
      expect(stored).toMatchObject({
        contract: 'AccessRegistry',
        blockNumber: sent.blockNumber,
        args: expect.objectContaining({ participantId: id }),
      });
      expect(stored.blockTime).toBeInstanceOf(Date);
      expect(seen).toContain(sent.hash);
      await expect(indexer.tick()).resolves.toBe(0);
    });

    it('rolls back events and checkpoint together when a handler fails', async () => {
      const before = await stateOf();
      const sent = await register(
        freshId(),
        adminRole,
        keys.addressOf(freshIndex()),
      );
      failNext = true;

      await expect(indexer.tick()).rejects.toThrow('handler failure');
      expect((await stateOf()).lastBlock).toBe(before.lastBlock);
      await expect(
        db.getRepository(ChainEvent).countBy({ txHash: sent.hash }),
      ).resolves.toBe(0);

      await indexer.catchUp();
      await expect(
        db.getRepository(ChainEvent).countBy({ txHash: sent.hash }),
      ).resolves.toBe(1);
      expect(seen.filter((h) => h === sent.hash)).toHaveLength(1);
    });

    it('rebuilds the same history on reindex', async () => {
      const repo = db.getRepository(ChainEvent);
      const snapshot = async () =>
        (
          await repo.find({ order: { blockNumber: 'ASC', logIndex: 'ASC' } })
        ).map(({ id: _id, indexedAt: _at, ...rest }) => rest);

      const before = await snapshot();
      const seenBefore = [...seen];
      expect(before.length).toBeGreaterThan(0);

      await indexer.reindex();
      expect(seen).toEqual([]);
      await indexer.catchUp();

      expect(await snapshot()).toEqual(before);
      expect(seen).toEqual(seenBefore);
    });

    it('rebuilds from scratch when the checkpointed block was rewritten', async () => {
      const count = await db.getRepository(ChainEvent).count();
      await db
        .getRepository(IndexerState)
        .update({ id: 'main' }, { lastBlockHash: '0x' + '00'.repeat(32) });

      await indexer.tick(); // detects the mismatch and clears
      await expect(db.getRepository(ChainEvent).count()).resolves.toBe(0);
      await indexer.catchUp();
      await expect(db.getRepository(ChainEvent).count()).resolves.toBe(count);
    });
  });
});

/** DATABASE_URL from .env, for the schema setup that runs before Nest loads it. */
function readDatabaseUrl(): string {
  process.loadEnvFile(join(__dirname, '..', '.env'));
  return process.env.DATABASE_URL!;
}
