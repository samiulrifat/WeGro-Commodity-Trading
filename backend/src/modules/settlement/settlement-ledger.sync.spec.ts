import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { SettlementLedgerSync } from './settlement-ledger.sync';

/**
 * Rounds the database cannot match to the ledger: an unknown project, a
 * split that works out differently here, a reason that differs. The
 * ordinary path runs end to end in the chain suite.
 */
describe('SettlementLedgerSync', () => {
  const PROJECT = randomUUID();
  const ACCOUNTANT = uuidToBytes32(randomUUID());
  const event = (eventName: string, args: Record<string, unknown>) =>
    ({
      eventName,
      args: { roundId: 5n, ...args },
      blockNumber: 1,
      logIndex: 0,
      blockTime: new Date('2026-10-14T00:00:00Z'),
    }) as never;
  const prepared = event('RoundPrepared', {
    projectId: uuidToBytes32(PROJECT),
    preparedBy: ACCOUNTANT,
    income: 0n,
    costs: 0n,
    profit: 0n,
    capitalReturn: 0n,
    fingerprint: `0x${'99'.repeat(32)}`,
  });
  const sync = () => new SettlementLedgerSync({ on: jest.fn() } as never);
  let errors: jest.SpyInstance;
  beforeEach(() => {
    errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('skips a round for a project it does not know, saying so', async () => {
    await sync().apply(prepared, fakeRepo() as never);
    expect(errors).toHaveBeenCalledWith(
      `Round 5 is for unknown project ${PROJECT}; skipped`,
    );
  });

  it('skips a round whose preparer is not a platform id', async () => {
    const m = fakeRepo();
    await sync().apply(
      event('RoundPrepared', {
        projectId: uuidToBytes32(PROJECT),
        preparedBy: `0x${'1'.repeat(64)}`,
      }),
      m as never,
    );
    expect(m.findOne).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not show a round as checked when its split differs from the ledger', async () => {
    const m = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({
          id: PROJECT,
          farmerId: randomUUID(),
          farmerBps: 4000,
          investorBps: 4000,
          wegroBps: 2000,
          issuedSlots: 0,
          slotPrice: 1_000_000n,
        }),
      ),
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('COUNT(*)')
            ? [{ count: '0' }]
            : sql.startsWith('UPDATE')
              ? [[{ verified: true }], 1]
              : [],
        ),
      ),
    });
    await sync().apply(prepared, m as never);
    expect(errors).toHaveBeenCalledWith(
      'Round 5: the split worked out here does not match the ledger; amounts are not shown as checked',
    );
  });

  it('logs a rejection whose reason differs from the stored one', async () => {
    const m = fakeRepo({
      query: jest.fn(() =>
        Promise.resolve([{ reject_reason_hash: `0x${'11'.repeat(32)}` }]),
      ),
    });
    await sync().apply(
      event('RoundRejected', { reasonHash: `0x${'22'.repeat(32)}` }),
      m as never,
    );
    expect(errors).toHaveBeenCalledWith(
      'Ledger reason for rejecting round 5 differs from the database',
    );
  });
});
