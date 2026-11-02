import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ReceiptApplier } from './receipt-applier';

/**
 * When the ledger took a transaction but our copy could not follow, people
 * are told plainly not to repeat it; a failed notice never fails the action.
 */
describe('ReceiptApplier', () => {
  const result = {
    hash: '0xabc',
    blockNumber: 7,
    blockTime: new Date('2026-10-14T00:00:00Z'),
    from: '0x1',
    gasUsed: 21_000n,
    events: [
      {
        contract: 'ProjectLedger',
        name: 'ProjectCreated',
        args: { amount: 5n },
        logIndex: 0,
      },
    ],
  };
  let errors: jest.SpyInstance;
  beforeEach(() => {
    errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const build = (opts: { handler?: jest.Mock; live?: jest.Mock }) => {
    const handlers = {
      handlersFor: () => (opts.handler ? [opts.handler] : []),
      liveHandlersFor: () => (opts.live ? [opts.live] : []),
    };
    const dataSource = {
      transaction: jest.fn((work: (m: object) => unknown) => work({})),
    };
    return new ReceiptApplier(handlers as never, dataSource as never);
  };

  it('says the ledger has it and not to repeat it when the database copy fails', async () => {
    const applier = build({
      handler: jest.fn(() => Promise.reject(new Error('deadlock'))),
    });
    const error = await applier
      .apply(result as never)
      .catch((e: InternalServerErrorException) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as InternalServerErrorException).getResponse()).toMatchObject(
      {
        code: 'READ_MODEL_UPDATE_FAILED',
        details: { txHash: '0xabc' },
        message: expect.stringContaining('Do not repeat the action'),
      },
    );
    expect(errors).toHaveBeenCalledWith(
      'Transaction 0xabc succeeded but updating the database failed',
      expect.stringContaining('deadlock'),
    );
  });

  it('applies each event with its values made JSON-safe, then sends notices', async () => {
    const handler = jest.fn(() => Promise.resolve());
    const live = jest.fn(() => Promise.resolve());
    await build({ handler, live }).apply(result as never);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ProjectCreated',
        args: { amount: '5' },
        txHash: '0xabc',
      }),
      {},
    );
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('logs a failed notice without failing the action', async () => {
    const applier = build({
      handler: jest.fn(() => Promise.resolve()),
      live: jest.fn(() => Promise.reject(new Error('mail down'))),
    });
    await expect(applier.apply(result as never)).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith(
      'Notifications for 0xabc failed: mail down',
    );
  });
});
