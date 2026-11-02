import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeQueryBuilder, fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { ParticipantLedgerSync } from './participant-ledger.sync';

/** Ledger events for people this database does not hold, or does not know. */
describe('ParticipantLedgerSync', () => {
  const event = (eventName: string, args: Record<string, unknown>) =>
    ({ eventName, args, blockNumber: 1, logIndex: 0, txHash: '0x1' }) as never;
  const sync = () =>
    new ParticipantLedgerSync({ on: jest.fn() } as never, {} as never);
  afterEach(() => jest.restoreAllMocks());

  it('ignores an id that is not a platform id, saying so', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const m = fakeRepo();
    await sync().apply(
      event('ParticipantVerified', { participantId: 'junk' }),
      m as never,
    );
    expect(warn).toHaveBeenCalledWith(
      'ParticipantVerified for a non-platform id; ignored',
    );
    expect(m.exists).not.toHaveBeenCalled();
  });

  it('notes a participant registered outside this database, and ignores events it does not mirror', async () => {
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const id = randomUUID();
    const m = fakeRepo({
      exists: jest.fn(() => Promise.resolve(false)),
      createQueryBuilder: jest.fn(
        () => fakeQueryBuilder({ execute: { affected: 0 } }).qb,
      ),
    });
    await sync().apply(
      event('ParticipantDetailsUpdated', { participantId: uuidToBytes32(id) }),
      m as never,
    );
    expect(debug).toHaveBeenCalledWith(
      `ParticipantDetailsUpdated for participant ${id} with no user row`,
    );
    const other = fakeRepo({ createQueryBuilder: jest.fn() });
    await sync().apply(
      event('SomethingElse', { participantId: uuidToBytes32(id) }),
      other as never,
    );
    expect(other.createQueryBuilder).not.toHaveBeenCalled();
  });
});
