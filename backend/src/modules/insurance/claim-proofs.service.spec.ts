import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  actor,
  config,
  fakeCrypto,
  fakeRepo,
  Role,
} from '../../../test/support/unit';
import { ClaimProofsService } from './claim-proofs.service';
import { ClaimStatus } from './insurance.enums';

/**
 * What the HTTP tests cannot reach: a proof undone when saving it fails, a
 * notice that fails, the references several proofs combine into, and a
 * stored file that no longer opens or matches its hash (refused). The rest
 * is in test/claim-payments.chain-spec.ts.
 */
describe('ClaimProofsService', () => {
  const insurer = actor(Role.INSURER);
  const accounts = actor(Role.ACCOUNTS);
  const dto = { amount: '5000', transferredOn: '2026-10-01', method: 'cash' };

  const build = (
    opts: {
      saveError?: Error;
      notifyError?: Error;
      claim?: Record<string, unknown>;
    } = {},
  ) => {
    const manager = fakeRepo({
      insert: jest.fn(() =>
        opts.saveError ? Promise.reject(opts.saveError) : Promise.resolve({}),
      ),
    });
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
    };
    const proofs = fakeRepo();
    const files = fakeRepo();
    const claim = {
      id: 'c1',
      projectId: 'p1',
      status: ClaimStatus.APPROVED,
      approvedAmount: 1_000_000n,
      ...opts.claim,
    };
    const claimRows = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(claim)),
      findOneByOrFail: jest.fn(() => Promise.resolve(claim)),
    });
    const projects = fakeRepo({
      findOne: jest.fn(() => Promise.resolve({ id: 'p1', title: 'Maize' })),
    });
    const claims = {
      payments: jest.fn(() => Promise.resolve(new Map())),
      payWith: jest.fn(() => Promise.resolve()),
    };
    const insurance = {
      currentAssignment: jest.fn(() =>
        Promise.resolve({ insurerId: insurer.id }),
      ),
    };
    let stored = 0;
    const store = {
      check: jest.fn((uploads: Buffer[]) => uploads.map(() => 'image/jpeg')),
      store: jest.fn(() =>
        Promise.resolve({
          storagePath: `proofs/${++stored}`,
          sha256: 'ab'.repeat(32),
          mimeType: 'image/jpeg',
          size: 3,
        }),
      ),
      remove: jest.fn(() => Promise.resolve()),
      read: jest.fn(() => Promise.resolve(Buffer.from('jpg'))),
    };
    const writer = {
      withRole: jest.fn(() => Promise.resolve(['accounts-1'])),
      send: jest.fn(() =>
        opts.notifyError ? Promise.reject(opts.notifyError) : Promise.resolve(),
      ),
    };
    const service = new ClaimProofsService(
      config({ PAYMENT_REF_SECRET: 'payment-secret-for-tests-only-32b' }),
      dataSource as never,
      proofs as never,
      files as never,
      claimRows as never,
      projects as never,
      claims as never,
      insurance as never,
      store as never,
      fakeCrypto() as never,
      { find: jest.fn() } as never,
      {} as never,
      writer as never,
      { condition: () => null } as never,
    );
    // The proof as shown afterwards: not what these tests are about.
    jest
      .spyOn(service as unknown as { one: () => Promise<object> }, 'one')
      .mockResolvedValue({ id: 'proof' });
    return {
      service,
      store,
      proofs,
      files,
      claimRows,
      claims,
      insurance,
      writer,
    };
  };

  const two = [Buffer.from('a'), Buffer.from('b')];

  it('removes the stored files when the proof cannot be saved', async () => {
    const { service, store } = build({ saveError: new Error('db down') });
    await expect(
      service.submit(insurer, 'c1', dto as never, two),
    ).rejects.toThrow('db down');
    expect(store.remove.mock.calls).toEqual([['proofs/1'], ['proofs/2']]);
  });

  it('takes the proof even if telling Accounts fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = build({ notifyError: new Error('mail down') });
    await expect(
      service.submit(insurer, 'c1', dto as never, two),
    ).resolves.toEqual({ id: 'proof' });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('claim-proof.submitted failed: mail down'),
    );
    error.mockRestore();
  });

  it('takes exactly what is left of the approved amount, not a poisha over', async () => {
    const { service, claims } = build();
    claims.payments.mockResolvedValue(
      new Map([['c1', { paid: 400_000n, underReview: 100_000n }]]),
    );
    await expect(
      service.submit(insurer, 'c1', { ...dto, amount: '5000' } as never, two),
    ).resolves.toEqual({ id: 'proof' });
    await expect(
      service.submit(
        insurer,
        'c1',
        { ...dto, amount: '5000.01' } as never,
        two,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PROOF_AMOUNT_INVALID',
        details: { remaining: '5000.00' },
      },
    });
  });

  it('shows a claim’s proofs only to its insurer and payment staff', async () => {
    const { service, insurance } = build();
    await expect(service.forClaim(insurer, 'c1')).resolves.toEqual([]);
    await expect(service.forClaim(accounts, 'c1')).resolves.toEqual([]);
    await expect(
      service.forClaim(actor(Role.INSURER), 'c1'),
    ).rejects.toMatchObject({ response: { code: 'CLAIM_NOT_FOUND' } });
    insurance.currentAssignment.mockResolvedValue(null as never);
    await expect(service.forClaim(insurer, 'c1')).rejects.toMatchObject({
      response: { code: 'CLAIM_NOT_FOUND' },
    });
    await expect(
      service.forClaim(actor(Role.FARMER), 'c1'),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    // A claim the officer has not yet sent does not exist for anyone.
    const draft = build({ claim: { status: ClaimStatus.SUBMITTED } });
    await expect(draft.service.forClaim(accounts, 'c1')).rejects.toMatchObject({
      response: { code: 'CLAIM_NOT_FOUND' },
    });
  });

  it('refuses a decision when another one got there first', async () => {
    const { service, proofs } = build();
    proofs.findOneBy.mockResolvedValue({ id: 'x1', status: 'pending' });
    proofs.update.mockResolvedValue({ affected: 0 });
    await expect(
      service.reject(accounts, 'x1', 'Wrong amount'),
    ).rejects.toMatchObject({ response: { code: 'CHANGED_MEANWHILE' } });
    await expect(service.accept(accounts, 'x1', 'REF 1')).rejects.toMatchObject(
      { response: { code: 'CHANGED_MEANWHILE' } },
    );
  });

  describe('a decision on a proof', () => {
    const proof = {
      id: 'x1',
      claimId: 'c1',
      insurerId: insurer.id,
      amount: 500_000n,
      status: 'pending',
    };
    const paid = (amount: bigint) =>
      Promise.resolve(new Map([['c1', { paid: amount, underReview: 0n }]]));

    it('leaves a claim paid in part waiting for the rest', async () => {
      const { service, proofs, claims } = build();
      proofs.findOneBy.mockResolvedValue(proof);
      claims.payments.mockReturnValue(paid(500_000n));
      await service.accept(accounts, 'x1', 'REF 1');
      expect(claims.payWith).not.toHaveBeenCalled();
    });

    it('does not touch the ledger for a claim already paid', async () => {
      const { service, proofs, claims } = build({
        claim: { status: ClaimStatus.PAID },
      });
      proofs.findOneBy.mockResolvedValue(proof);
      await service.accept(accounts, 'x1', 'REF 1');
      expect(claims.payments).not.toHaveBeenCalled();
      expect(claims.payWith).not.toHaveBeenCalled();
    });

    it('pays a claim covered in full with the single reference as it is', async () => {
      const { service, proofs, claims, writer } = build();
      proofs.findOneBy.mockResolvedValue(proof);
      proofs.find.mockResolvedValue([
        { id: 'x1', verifiedRefEnc: 'enc[claim_proofs.verified_ref:x1]REF 1' },
      ]);
      claims.payments.mockReturnValue(paid(1_000_000n));
      await service.accept(accounts, 'x1', 'REF 1');
      expect(claims.payWith).toHaveBeenCalledWith(accounts, 'c1', 'REF 1');
      expect(writer.send).toHaveBeenCalledWith(
        expect.anything(),
        [insurer.id],
        expect.objectContaining({
          kind: 'claim-proof.accepted',
          params: { amount: '5000.00', project: 'Maize' },
          subject: { type: 'claim', id: 'c1' },
        }),
      );
    });

    it('fingerprints several references too long for the ledger', async () => {
      const { service, proofs, claims } = build();
      proofs.findOneBy.mockResolvedValue(proof);
      const long = 'R'.repeat(100);
      proofs.find.mockResolvedValue([
        {
          id: 'x1',
          verifiedRefEnc: `enc[claim_proofs.verified_ref:x1]${long}`,
        },
        {
          id: 'x2',
          verifiedRefEnc: `enc[claim_proofs.verified_ref:x2]${long}`,
        },
      ]);
      claims.payments.mockReturnValue(paid(1_000_000n));
      await service.accept(accounts, 'x1', 'REF 1');
      expect(claims.payWith).toHaveBeenCalledWith(
        accounts,
        'c1',
        expect.stringMatching(/^PROOFS [0-9A-F]{64}$/),
      );
    });
  });

  it('refuses a stored file that no longer matches its hash, and tells the super admin and admins', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, files, writer } = build();
    files.findOne.mockResolvedValue({
      id: 'f1',
      sha256: 'not-the-hash',
      mimeType: 'image/jpeg',
      proof: { insurerId: insurer.id, claimId: 'c1' },
    });
    await expect(service.file(accounts, 'f1')).rejects.toMatchObject({
      response: { code: 'PROOF_FILE_ALTERED' },
    });
    expect(error).toHaveBeenCalledWith(
      'Claim proof file f1 will not open or does not match its hash',
    );
    expect(writer.withRole).toHaveBeenCalledWith(expect.anything(), [
      Role.SUPER_ADMIN,
      Role.ADMIN,
    ]);
    expect(writer.send).toHaveBeenCalledWith(
      expect.anything(),
      ['accounts-1'],
      expect.objectContaining({
        kind: 'system.claim-proof-file-altered',
        params: { project: 'Maize' },
        subject: { type: 'claim', id: 'c1' },
        // Once per file, however often it is opened.
        key: 'claim-proof-file:f1:altered',
      }),
    );
    error.mockRestore();
  });

  it('refuses a stored file that will not open, even with its claim gone', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, files, store, writer, claimRows } = build();
    store.read.mockResolvedValue(null as never);
    claimRows.findOneBy.mockResolvedValue(null as never);
    files.findOne.mockResolvedValue({
      id: 'f3',
      sha256: 'ab'.repeat(32),
      mimeType: 'image/jpeg',
      proof: { insurerId: insurer.id, claimId: 'c1' },
    });
    await expect(service.file(insurer, 'f3')).rejects.toMatchObject({
      response: { code: 'PROOF_FILE_ALTERED' },
    });
    expect(writer.send).toHaveBeenCalledWith(
      expect.anything(),
      ['accounts-1'],
      expect.objectContaining({
        params: { project: '' },
        key: 'claim-proof-file:f3:altered',
      }),
    );
    error.mockRestore();
  });

  it('serves a stored file to its insurer and payment staff, not another insurer', async () => {
    const { service, files, writer } = build();
    files.findOne.mockResolvedValue({
      id: 'f2',
      sha256: createHash('sha256').update('jpg').digest('hex'),
      mimeType: 'image/jpeg',
      proof: { insurerId: insurer.id, claimId: 'c1' },
    });
    await expect(service.file(insurer, 'f2')).resolves.toEqual({
      data: Buffer.from('jpg'),
      mimeType: 'image/jpeg',
    });
    await expect(service.file(accounts, 'f2')).resolves.toBeDefined();
    await expect(service.file(actor(Role.INSURER), 'f2')).rejects.toMatchObject(
      { response: { code: 'PROOF_FILE_MISSING' } },
    );
    expect(writer.send).not.toHaveBeenCalled();
  });
});
