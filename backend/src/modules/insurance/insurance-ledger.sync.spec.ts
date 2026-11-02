import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { fakeQueryBuilder, fakeRepo } from '../../../test/support/unit';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { InsuranceLedgerSync } from './insurance-ledger.sync';

/**
 * Insurance events where the database holds a different fingerprint than
 * the ledger (drift), or no such row: logged or ignored, never applied
 * blindly. The ordinary path runs end to end in the chain suite.
 */
describe('InsuranceLedgerSync', () => {
  const ID = randomUUID();
  const event = (eventName: string, args: Record<string, unknown>) =>
    ({
      eventName,
      args,
      blockNumber: 5,
      logIndex: 0,
      blockTime: new Date('2026-10-14T00:00:00Z'),
    }) as never;
  const ledgerHash = `0x${'22'.repeat(32)}`;
  const storedHash = `0x${'11'.repeat(32)}`;
  let errors: jest.SpyInstance;
  beforeEach(() => {
    errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const run = async (e: never, row: object | null, affected = 1) => {
    const m = fakeRepo({
      findOne: jest.fn(() => Promise.resolve(row)),
      createQueryBuilder: jest.fn(
        () => fakeQueryBuilder({ execute: { affected } }).qb,
      ),
    });
    await new InsuranceLedgerSync({ on: jest.fn() } as never).apply(
      e,
      m as never,
    );
    return m;
  };

  it('logs each record whose stored fingerprint differs from the ledger', async () => {
    const id = uuidToBytes32(ID);
    await run(
      event('WeatherEventRecorded', { eventId: id, detailsHash: ledgerHash }),
      { id: ID, detailsHash: storedHash },
    );
    await run(event('ClaimOpened', { claimId: id, claimHash: ledgerHash }), {
      id: ID,
      claimHash: storedHash,
    });
    await run(
      event('ClaimStatusChanged', {
        claimId: id,
        status: 3n,
        approvedAmount: 100n,
        assessmentHash: ledgerHash,
      }),
      { id: ID, assessmentHash: storedHash },
    );
    await run(event('ClaimPaid', { claimId: id, paymentRefHash: ledgerHash }), {
      id: ID,
      paymentRefHash: storedHash,
    });
    expect(errors.mock.calls.map(([m]) => m)).toEqual([
      `Ledger fingerprint of weather event ${ID} differs from the database`,
      `Ledger fingerprint of claim ${ID} differs from the database`,
      `Ledger fingerprint of the assessment of claim ${ID} differs from the database`,
      `Ledger payment fingerprint of claim ${ID} differs from the database`,
    ]);
  });

  it('ignores events for rows it does not have, or ids that are not the platform’s', async () => {
    const id = uuidToBytes32(ID);
    for (const e of [
      event('WeatherEventRecorded', { eventId: id }),
      event('ClaimOpened', { claimId: id }),
      event('ClaimStatusChanged', { claimId: id, status: 4n }),
      event('ClaimPaid', { claimId: id }),
    ]) {
      const m = await run(e, null);
      expect(m.update).not.toHaveBeenCalled();
    }
    const junk = await run(event('ClaimPaid', { claimId: 'junk' }), null);
    expect(junk.findOne).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('ignores a cover for terms it does not know, or older than what it holds', async () => {
    const debug = jest.spyOn(Logger.prototype, 'debug');
    await run(
      event('CoverageSet', {
        projectId: uuidToBytes32(ID),
        termsHash: ledgerHash,
      }),
      null,
      0,
    );
    expect(debug).toHaveBeenCalledWith(
      `CoverageSet for project ${ID}: unknown terms or older; ignored`,
    );
  });
});
