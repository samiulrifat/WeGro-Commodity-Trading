import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { FieldRecordLedgerSync } from './field-record-ledger.sync';

/** Farm updates whose stored copy differs from the ledger, or that are not ours. */
describe('FieldRecordLedgerSync', () => {
  const event = (args: Record<string, unknown>) =>
    ({
      eventName: 'EntryRecorded',
      args,
      blockNumber: 1,
      logIndex: 0,
      txHash: '0x1  ',
      blockTime: new Date('2026-10-14T00:00:00Z'),
    }) as never;
  afterEach(() => jest.restoreAllMocks());

  it('logs a record whose data or photo fingerprint differs, and still marks it recorded', async () => {
    const errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const id = randomUUID();
    const m = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({
          id,
          dataHash: `0x${'11'.repeat(32)}`,
          photoHash: null,
        }),
      ),
    });
    await new FieldRecordLedgerSync({ on: jest.fn() } as never).apply(
      event({
        entryId: uuidToBytes32(id),
        dataHash: `0x${'11'.repeat(32)}`,
        photoHash: `0x${'22'.repeat(32)}`,
      }),
      m as never,
    );
    expect(errors).toHaveBeenCalledWith(
      `Ledger fingerprints of field record ${id} differ from the database`,
    );
    expect(m.update).toHaveBeenCalledWith(
      expect.anything(),
      { id, status: 'submitted' },
      expect.objectContaining({ status: 'recorded', txHash: '0x1' }),
    );
  });

  it('ignores an entry id that is not the platform’s', async () => {
    const m = fakeRepo();
    await new FieldRecordLedgerSync({ on: jest.fn() } as never).apply(
      event({ entryId: 'junk' }),
      m as never,
    );
    expect(m.findOne).not.toHaveBeenCalled();
  });
});
