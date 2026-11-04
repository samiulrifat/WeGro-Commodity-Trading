import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  actor,
  config,
  fakeClock,
  fakeCrypto,
  fakeRepo,
  revert,
  Role,
} from '../../../test/support/unit';
import { DealProofsService } from './deal-proofs.service';
import { OfferStatus } from './trade.enums';

const NOW = new Date('2026-10-14T06:00:00Z');

/**
 * What the HTTP tests cannot reach: a proof undone when saving it or
 * stopping the clock fails, a notice that fails, a stored file that no
 * longer opens or matches its hash (refused). The rest is in
 * test/deal-payments.chain-spec.ts.
 */
describe('DealProofsService', () => {
  const buyer = actor(Role.BUYER);
  const accounts = actor(Role.ACCOUNTS);
  const dto = { amount: '5000', transferredOn: '2026-10-01', method: 'cash' };

  const build = (
    opts: {
      saveError?: Error;
      pauseError?: Error;
      notifyError?: Error;
      offer?: Record<string, unknown>;
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
    const offer = {
      id: 1,
      buyerId: buyer.id,
      status: OfferStatus.APPROVED,
      quantity: 100,
      unitPrice: 10_000n,
      buyerFee: 5_000n,
      pausedRemaining: null,
      paymentDueAt: new Date(NOW.getTime() + 3_600_000),
      ...opts.offer,
    };
    const offers = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(offer)),
      findOneByOrFail: jest.fn(() => Promise.resolve(offer)),
    });
    const trade = {
      payments: jest.fn(() => Promise.resolve(new Map())),
      pauseOnLedger: jest.fn(() =>
        opts.pauseError ? Promise.reject(opts.pauseError) : Promise.resolve(),
      ),
      resumeOnLedger: jest.fn(() => Promise.resolve()),
      confirmWith: jest.fn(() => Promise.resolve()),
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
    const service = new DealProofsService(
      config({ PAYMENT_REF_SECRET: 'payment-secret-for-tests-only-32b' }),
      dataSource as never,
      proofs as never,
      files as never,
      offers as never,
      trade as never,
      store as never,
      fakeCrypto() as never,
      { find: jest.fn() } as never,
      {} as never,
      writer as never,
      { condition: () => null } as never,
      fakeClock(NOW) as never,
    );
    // The proof as shown afterwards: not what these tests are about.
    jest
      .spyOn(service as unknown as { one: () => Promise<object> }, 'one')
      .mockResolvedValue({ id: 'proof' });
    return { service, store, proofs, files, offers, trade, writer };
  };

  const two = [Buffer.from('a'), Buffer.from('b')];

  it('removes the stored files when the proof cannot be saved', async () => {
    const { service, store } = build({ saveError: new Error('db down') });
    await expect(service.submit(buyer, 1, dto as never, two)).rejects.toThrow(
      'db down',
    );
    expect(store.remove.mock.calls).toEqual([['proofs/1'], ['proofs/2']]);
  });

  it('undoes the proof when the ledger will not stop the clock', async () => {
    const { service, store, proofs } = build({
      pauseError: revert('PaymentOverdue'),
    });
    await expect(service.submit(buyer, 1, dto as never, two)).rejects.toThrow();
    expect(proofs.delete).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledTimes(2);
  });

  it('keeps the proof when the ledger could not be reached (it is retried)', async () => {
    const { service, store, proofs } = build({
      pauseError: new Error('node unreachable'),
    });
    await expect(service.submit(buyer, 1, dto as never, two)).rejects.toThrow(
      'node unreachable',
    );
    expect(proofs.delete).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('takes the proof even if telling Accounts fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = build({ notifyError: new Error('mail down') });
    await expect(service.submit(buyer, 1, dto as never, two)).resolves.toEqual({
      id: 'proof',
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('deal-proof.submitted failed: mail down'),
    );
    error.mockRestore();
  });

  it('counts the fee in what can be sent: exactly the whole is taken, a poisha over is not', async () => {
    const { service } = build();
    // 100 at Tk 100 is Tk 10,000; the fee of Tk 50 makes it Tk 10,050.
    await expect(
      service.submit(buyer, 1, { ...dto, amount: '10050' } as never, two),
    ).resolves.toEqual({ id: 'proof' });
    await expect(
      service.submit(buyer, 1, { ...dto, amount: '10050.01' } as never, two),
    ).rejects.toMatchObject({
      response: {
        code: 'PROOF_AMOUNT_INVALID',
        details: { remaining: '10050.00' },
      },
    });
  });

  it('refuses a proof past the deadline before storing anything, unless the clock is stopped', async () => {
    const past = new Date(NOW.getTime() - 1);
    const late = build({ offer: { paymentDueAt: past } });
    await expect(
      late.service.submit(buyer, 1, dto as never, two),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_OVERDUE' } });
    expect(late.store.store).not.toHaveBeenCalled();

    // A second part while the first is reviewed: no second stop on the ledger.
    const held = build({ offer: { paymentDueAt: past, pausedRemaining: 60 } });
    await expect(
      held.service.submit(buyer, 1, dto as never, two),
    ).resolves.toEqual({ id: 'proof' });
    expect(held.trade.pauseOnLedger).not.toHaveBeenCalled();
  });

  it('shows a deal’s proofs only to its buyer and payment staff', async () => {
    const { service, proofs } = build();
    proofs.find.mockResolvedValue([]);
    await expect(service.forOffer(buyer, 1)).resolves.toEqual([]);
    await expect(service.forOffer(accounts, 1)).resolves.toEqual([]);
    await expect(service.forOffer(actor(Role.BUYER), 1)).rejects.toMatchObject({
      response: { code: 'OFFER_NOT_FOUND' },
    });
    await expect(service.forOffer(actor(Role.SELLER), 1)).rejects.toMatchObject(
      { response: { code: 'FORBIDDEN' } },
    );
  });

  it('refuses a decision when another one got there first', async () => {
    const { service, proofs } = build();
    proofs.findOneBy.mockResolvedValue({ id: 'p1', status: 'pending' });
    proofs.update.mockResolvedValue({ affected: 0 });
    await expect(
      service.reject(accounts, 'p1', 'Wrong amount'),
    ).rejects.toMatchObject({ response: { code: 'CHANGED_MEANWHILE' } });
    await expect(service.accept(accounts, 'p1', 'REF 1')).rejects.toMatchObject(
      { response: { code: 'CHANGED_MEANWHILE' } },
    );
  });

  describe('a decision on a proof', () => {
    const under = (paid: bigint, underReview: bigint) =>
      Promise.resolve(new Map([[1, { paid, underReview }]]));
    const proof = {
      id: 'p1',
      offerId: 1,
      buyerId: buyer.id,
      amount: 500_000n,
      status: 'pending',
    };

    it('leaves the clock stopped while another proof is under review', async () => {
      const { service, proofs, trade } = build({
        offer: { pausedRemaining: 60 },
      });
      proofs.findOneBy.mockResolvedValue(proof);
      trade.payments.mockReturnValue(under(500_000n, 100n));
      await service.accept(accounts, 'p1', 'REF 1');
      expect(trade.resumeOnLedger).not.toHaveBeenCalled();
      expect(trade.confirmWith).not.toHaveBeenCalled();
      await service.reject(accounts, 'p1', 'Wrong amount');
      expect(trade.resumeOnLedger).not.toHaveBeenCalled();
    });

    it('does not start a clock that never stopped', async () => {
      const { service, proofs, trade } = build();
      proofs.findOneBy.mockResolvedValue(proof);
      trade.payments.mockReturnValue(under(500_000n, 0n));
      await service.accept(accounts, 'p1', 'REF 1');
      await service.reject(accounts, 'p1', 'Wrong amount');
      expect(trade.resumeOnLedger).not.toHaveBeenCalled();
    });

    it('does not touch the ledger for a deal that has ended', async () => {
      const { service, proofs, trade } = build({
        offer: { status: OfferStatus.CANCELLED, pausedRemaining: null },
      });
      proofs.findOneBy.mockResolvedValue(proof);
      await service.accept(accounts, 'p1', 'REF 1');
      await service.reject(accounts, 'p1', 'Wrong amount');
      expect(trade.payments).not.toHaveBeenCalled();
      expect(trade.confirmWith).not.toHaveBeenCalled();
      expect(trade.resumeOnLedger).not.toHaveBeenCalled();
    });

    it('confirms a deal paid in full with the single reference as it is', async () => {
      const { service, proofs, trade } = build();
      proofs.findOneBy.mockResolvedValue(proof);
      proofs.find.mockResolvedValue([
        { id: 'p1', verifiedRefEnc: 'enc[deal_proofs.verified_ref:p1]REF 1' },
      ]);
      trade.payments.mockReturnValue(under(1_005_000n, 0n));
      await service.accept(accounts, 'p1', 'REF 1');
      expect(trade.confirmWith).toHaveBeenCalledWith(accounts, 1, 'REF 1');
    });

    it('fingerprints several references too long for the ledger', async () => {
      const { service, proofs, trade } = build();
      proofs.findOneBy.mockResolvedValue(proof);
      const long = 'R'.repeat(100);
      proofs.find.mockResolvedValue([
        { id: 'p1', verifiedRefEnc: `enc[deal_proofs.verified_ref:p1]${long}` },
        { id: 'p2', verifiedRefEnc: `enc[deal_proofs.verified_ref:p2]${long}` },
      ]);
      trade.payments.mockReturnValue(under(1_005_000n, 0n));
      await service.accept(accounts, 'p1', 'REF 1');
      expect(trade.confirmWith).toHaveBeenCalledWith(
        accounts,
        1,
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
      proof: { buyerId: buyer.id, offerId: 7 },
    });
    await expect(service.file(accounts, 'f1')).rejects.toMatchObject({
      response: { code: 'PROOF_FILE_ALTERED' },
    });
    expect(error).toHaveBeenCalledWith(
      'Deal proof file f1 will not open or does not match its hash',
    );
    expect(writer.withRole).toHaveBeenCalledWith(expect.anything(), [
      Role.SUPER_ADMIN,
      Role.ADMIN,
    ]);
    expect(writer.send).toHaveBeenCalledWith(
      expect.anything(),
      ['accounts-1'],
      expect.objectContaining({
        kind: 'system.deal-proof-file-altered',
        params: { offerId: '7' },
        subject: { type: 'offer', id: 7 },
        // Once per file, however often it is opened.
        key: 'deal-proof-file:f1:altered',
      }),
    );
    error.mockRestore();
  });

  it('refuses a stored file that will not open', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, files, store, writer } = build();
    store.read.mockResolvedValue(null as never);
    files.findOne.mockResolvedValue({
      id: 'f3',
      sha256: 'ab'.repeat(32),
      mimeType: 'image/jpeg',
      proof: { buyerId: buyer.id, offerId: 7 },
    });
    await expect(service.file(buyer, 'f3')).rejects.toMatchObject({
      response: { code: 'PROOF_FILE_ALTERED' },
    });
    expect(writer.send).toHaveBeenCalledWith(
      expect.anything(),
      ['accounts-1'],
      expect.objectContaining({ key: 'deal-proof-file:f3:altered' }),
    );
    error.mockRestore();
  });

  it('serves a stored file to its buyer and payment staff, not another buyer', async () => {
    const { service, files, writer } = build();
    files.findOne.mockResolvedValue({
      id: 'f2',
      sha256: createHash('sha256').update('jpg').digest('hex'),
      mimeType: 'image/jpeg',
      proof: { buyerId: buyer.id, offerId: 7 },
    });
    await expect(service.file(buyer, 'f2')).resolves.toEqual({
      data: Buffer.from('jpg'),
      mimeType: 'image/jpeg',
    });
    await expect(service.file(accounts, 'f2')).resolves.toBeDefined();
    await expect(service.file(actor(Role.BUYER), 'f2')).rejects.toMatchObject({
      response: { code: 'PROOF_FILE_MISSING' },
    });
    expect(writer.send).not.toHaveBeenCalled();
  });
});
