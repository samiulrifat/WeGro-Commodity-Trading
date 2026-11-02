import { QueryFailedError } from 'typeorm';
import {
  actor,
  ChainState,
  fakeRepo,
  fakeTx,
  Role,
} from '../../../test/support/unit';
import { DetailChangesService } from './detail-changes.service';

/**
 * Approving a details change, where the HTTP tests cannot reach: flags not
 * acknowledged, a number or NID taken meanwhile (caught before the ledger),
 * the order of the writes, and nobody reviewing their own change. The usual
 * path runs end to end in the chain suite.
 */
describe('DetailChangesService', () => {
  const USER = '55555555-5555-4555-8555-555555555555';
  const requested = {
    fullName: 'Rahim Uddin',
    phone: '01711000009',
    nid: '5839204716',
    dateOfBirth: '1980-05-05',
    district: 'BOGURA',
    address: 'Village 2',
  };
  const build = (
    opts: {
      changedFields?: string[];
      warn?: boolean;
      nidTaken?: boolean;
      saveError?: Error;
      /** Run the transaction's work, its updates failing with this. */
      updateError?: Error;
      ledgerError?: Error;
    } = {},
  ) => {
    const change = {
      id: 'c1',
      userId: USER,
      status: 'pending',
      changedFields: opts.changedFields ?? ['address'],
      idCheck: {
        outcome: opts.warn ? 'flagged' : 'passed',
        checks: opts.warn ? [{ rule: 'name', result: 'warn' }] : [],
      },
      detailsEnc: JSON.stringify(requested),
    };
    const steps: string[] = [];
    const manager = {
      update: jest.fn((entity: { name: string }) => {
        steps.push(`update ${entity.name}`);
        return opts.updateError && entity.name === 'User'
          ? Promise.reject(opts.updateError)
          : Promise.resolve({ affected: 1 });
      }),
    };
    const dataSource = {
      transaction: jest.fn((work: (m: unknown) => Promise<unknown>) =>
        opts.saveError ? Promise.reject(opts.saveError) : work(manager),
      ),
    };
    const ledger = fakeTx();
    if (opts.ledgerError) ledger.fail(opts.ledgerError);
    const send = ledger.tx.send;
    ledger.tx.send = jest.fn((...args: Parameters<typeof send>) => {
      steps.push('ledger');
      return send(...args);
    }) as typeof send;
    const service = new DetailChangesService(
      dataSource as never,
      fakeRepo({
        findOneOrFail: jest.fn(() =>
          Promise.resolve({
            id: USER,
            role: Role.INVESTOR,
            chainState: ChainState.CONFIRMED,
          }),
        ),
        exists: jest.fn(() => Promise.resolve(false)),
      }) as never,
      fakeRepo({
        findOneByOrFail: jest.fn(() => Promise.resolve({ userId: USER })),
        exists: jest.fn(() => Promise.resolve(opts.nidTaken ?? false)),
      }) as never,
      fakeRepo({ findOne: jest.fn(() => Promise.resolve(change)) }) as never,
      {
        fingerprint: () => `0x${'aa'.repeat(32)}`,
        phoneIndex: () => 'phone',
        nidIndex: () => 'nid',
        seal: () => ({}),
      } as never,
      { decrypt: (enc: string) => enc } as never,
      {} as never,
      ledger.tx as never,
      { apply: jest.fn(), announce: jest.fn() } as never,
      { send: jest.fn(() => Promise.resolve(1)) } as never,
      { write: jest.fn(() => Promise.resolve()) } as never,
      {} as never,
    );
    // The change as shown afterwards: not what these tests are about.
    jest.spyOn(service, 'review').mockResolvedValue({ id: 'c1' } as never);
    return Object.assign(service, { steps });
  };
  const admin = actor(Role.ADMIN);

  it('needs flags from the ID check acknowledged first', async () => {
    await expect(
      build({ warn: true }).approve(admin, 'c1'),
    ).rejects.toMatchObject({
      response: { code: 'ID_CHECK_FLAGS_NOT_ACKNOWLEDGED' },
    });
  });

  it('refuses an NID someone registered meanwhile', async () => {
    await expect(
      build({ changedFields: ['nid'], nidTaken: true }).approve(admin, 'c1'),
    ).rejects.toMatchObject({ response: { code: 'NID_ALREADY_REGISTERED' } });
  });

  it('names a number taken while saving, and passes other failures on', async () => {
    const race = new QueryFailedError('UPDATE ...', [], {
      code: '23505',
      constraint: 'uq_users_phone_index',
    } as unknown as Error);
    await expect(
      build({ saveError: race }).approve(admin, 'c1'),
    ).rejects.toMatchObject({ response: { code: 'PHONE_ALREADY_REGISTERED' } });
    await expect(
      build({ saveError: new Error('disk full') }).approve(admin, 'c1'),
    ).rejects.toThrow('disk full');
  });

  it('holds the new details in the database before writing the ledger', async () => {
    const service = build({ changedFields: ['phone'] });
    await expect(service.approve(admin, 'c1')).resolves.toEqual({ id: 'c1' });
    expect(service.steps).toEqual([
      'update PersonalDetails',
      'update User',
      'ledger',
      'update DetailChangeRequest',
    ]);
  });

  it('leaves the ledger alone when the number was taken while saving', async () => {
    const race = new QueryFailedError('UPDATE ...', [], {
      code: '23505',
      constraint: 'uq_users_phone_index',
    } as unknown as Error);
    const service = build({ changedFields: ['phone'], updateError: race });
    await expect(service.approve(admin, 'c1')).rejects.toMatchObject({
      response: { code: 'PHONE_ALREADY_REGISTERED' },
    });
    expect(service.steps).not.toContain('ledger');
  });

  it('keeps nothing when the ledger refuses (the transaction is undone)', async () => {
    const service = build({ ledgerError: new Error('node unreachable') });
    await expect(service.approve(admin, 'c1')).rejects.toThrow(
      'node unreachable',
    );
    expect(service.steps).not.toContain('update DetailChangeRequest');
  });

  it('never lets someone decide their own change', async () => {
    await expect(
      build().reject(actor(Role.ADMIN, { id: USER }), 'c1', 'No'),
    ).rejects.toMatchObject({ response: { code: 'CHANGE_OWN_REQUEST' } });
  });
});
