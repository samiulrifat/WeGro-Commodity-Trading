import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { TrackRecordLedgerSync } from './track-record-ledger.sync';

/** Banks and permissions whose stored copy differs from the ledger. */
describe('TrackRecordLedgerSync', () => {
  const event = (eventName: string, args: Record<string, unknown>) =>
    ({
      eventName,
      args,
      blockNumber: 1,
      logIndex: 0,
      blockTime: new Date('2026-10-14T00:00:00Z'),
    }) as never;
  const sync = () => new TrackRecordLedgerSync({ on: jest.fn() } as never);
  let errors: jest.SpyInstance;
  beforeEach(() => {
    errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs a bank whose details differ from its ledger fingerprint', async () => {
    const id = randomUUID();
    const m = fakeRepo({
      query: jest.fn(() =>
        Promise.resolve([{ details_hash: `0x${'11'.repeat(32)}` }]),
      ),
    });
    await sync().apply(
      event('BankRegistered', {
        bankId: uuidToBytes32(id),
        detailsHash: `0x${'22'.repeat(32)}`,
      }),
      m as never,
    );
    expect(errors).toHaveBeenCalledWith(
      `Ledger fingerprint of bank ${id} differs from the database`,
    );
  });

  it('logs a permission whose expiry differs from the ledger', async () => {
    const farmer = randomUUID();
    const m = fakeRepo({
      query: jest.fn(() =>
        Promise.resolve([
          [{ expires_at: new Date('2027-01-01T00:00:00Z') }],
          1,
        ]),
      ),
    });
    await sync().apply(
      event('ConsentGranted', {
        farmerId: uuidToBytes32(farmer),
        bankId: uuidToBytes32(randomUUID()),
        evidenceHash: `0x${'33'.repeat(32)}`,
        expiresAt: 1_800_000_000n,
      }),
      m as never,
    );
    expect(errors).toHaveBeenCalledWith(
      `Ledger expiry of a consent of ${farmer} differs from the database`,
    );
  });
});
