import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeQueryBuilder, fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { ProjectLedgerSync } from './project-ledger.sync';

/**
 * The ledger's project events where the database disagrees or lacks the
 * row (drift, or records made by another backend). The ordinary path is
 * covered end to end by the chain suite.
 */
describe('ProjectLedgerSync', () => {
  const PROJECT = randomUUID();
  const INVESTOR = randomUUID();
  const event = (eventName: string, args: Record<string, unknown>) => ({
    eventName,
    args,
    blockNumber: 1,
    logIndex: 0,
    txHash: '0x1',
    blockTime: new Date('2026-10-14T00:00:00Z'),
  });
  const refund = event('RefundRecorded', {
    projectId: uuidToBytes32(PROJECT),
    investorId: uuidToBytes32(INVESTOR),
    paymentRefHash: `0x${'ab'.repeat(32)}`,
  });

  let errors: jest.SpyInstance;
  beforeEach(() => {
    errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const sync = () => new ProjectLedgerSync({ on: jest.fn() } as never);

  it('logs when the ledger holds other terms than the database', async () => {
    const m = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({
          id: PROJECT,
          termsHash: `0x${'11'.repeat(32)}`,
          totalSlots: 5,
        }),
      ),
    });
    await sync().apply(
      event('ProjectCreated', {
        projectId: uuidToBytes32(PROJECT),
        termsHash: `0x${'22'.repeat(32)}`,
        totalSlots: 5n,
      }),
      m as never,
    );
    expect(errors).toHaveBeenCalledWith(
      `Ledger terms of project ${PROJECT} do not match the database`,
    );
  });

  it('ignores events that name no valid id', async () => {
    const m = fakeRepo();
    await sync().apply(
      event('RefundRecorded', { projectId: 'junk', investorId: 7 }),
      m as never,
    );
    await sync().apply(
      event('ProjectCreated', { projectId: '0x1234' }),
      m as never,
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.findOne).not.toHaveBeenCalled();
  });

  it('keeps a refund recorded elsewhere, worth what the investor holds', async () => {
    const insert = fakeQueryBuilder();
    const m = fakeRepo({
      update: jest.fn(() => Promise.resolve({ affected: 0 })),
      query: jest.fn(() => Promise.resolve([{ amount: '2000000' }])),
      createQueryBuilder: jest.fn(() => insert.qb),
    });
    await sync().apply(refund, m as never);
    const values = insert.calls.find(([c]) => c === 'values')?.[1];
    expect(values).toMatchObject({
      projectId: PROJECT,
      investorId: INVESTOR,
      amount: 2_000_000n,
      paymentRefEnc: null,
      confirmed: true,
    });
  });

  it('logs a refund to someone who holds nothing here, and ignores an unknown project', async () => {
    const holding = (rows: object[]) =>
      fakeRepo({
        update: jest.fn(() => Promise.resolve({ affected: 0 })),
        query: jest.fn(() => Promise.resolve(rows)),
        createQueryBuilder: jest.fn(() => fakeQueryBuilder().qb),
      });
    const none = holding([{ amount: '0' }]);
    await sync().apply(refund, none as never);
    expect(errors).toHaveBeenCalledWith(
      `Refund recorded for ${INVESTOR} on project ${PROJECT}, who holds no slots here`,
    );
    expect(none.createQueryBuilder).not.toHaveBeenCalled();
    const unknown = holding([]);
    await sync().apply(refund, unknown as never);
    expect(unknown.createQueryBuilder).not.toHaveBeenCalled();
  });
});
