import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeQueryBuilder, fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { WarehouseLedgerSync } from './warehouse-ledger.sync';

/** A receipt whose stored intake differs from the ledger's fingerprint is logged. */
describe('WarehouseLedgerSync', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs a receipt whose intake fingerprint differs from the ledger', async () => {
    const errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const id = `0x${'ab'.repeat(32)}`;
    const m = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({ id, detailsHash: `0x${'11'.repeat(32)}` }),
      ),
      createQueryBuilder: jest.fn(() => fakeQueryBuilder().qb),
    });
    await new WarehouseLedgerSync({ on: jest.fn() } as never).apply(
      {
        eventName: 'ReceiptIssued',
        args: {
          receiptId: id,
          detailsHash: `0x${'22'.repeat(32)}`,
          owner: uuidToBytes32(randomUUID()),
          quantity: 500n,
          expiresAt: 1_800_000_000n,
          issuedBy: uuidToBytes32(randomUUID()),
        },
        blockNumber: 1,
        logIndex: 0,
        blockTime: new Date('2026-10-14T00:00:00Z'),
      } as never,
      m as never,
    );
    expect(errors).toHaveBeenCalledWith(
      `Ledger intake fingerprint of receipt ${id} differs from the database`,
    );
  });
});
