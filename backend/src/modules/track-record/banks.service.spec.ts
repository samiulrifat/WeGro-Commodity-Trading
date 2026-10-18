import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidToBytes32, ZERO_BYTES32 } from '../../blockchain/utils/ids';
import {
  actor,
  ChainState,
  fakeRepo,
  fakeTx,
  ParticipantStatus,
  revert,
  Role,
  uniqueViolation,
} from '../../../test/support/unit';
import type { Bank } from './entities/bank.entity';
import { BanksService } from './banks.service';
import { bankFingerprint } from './track-record-fingerprints';

const OFFICER = '7c2d2f0e-5b0a-4c39-9a51-2a1f5c0f9e11';
const BANK = '0b8a3f1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('BanksService', () => {
  const admin = actor(Role.ADMIN);
  const dto = {
    name: 'Krishi Bank',
    branchName: 'Bogura',
    districtCode: 'BOGURA',
    address: 'Road 1',
  };

  const build = (
    over: {
      banks?: Record<string, unknown>;
      users?: Record<string, unknown>;
    } = {},
  ) => {
    const rows: Bank[] = [];
    const banks = fakeRepo({
      insert: jest.fn((b: Bank) => (rows.push(b), Promise.resolve({}))),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(rows.find((b) => b.id === id) ?? null),
      ),
      ...over.banks,
    });
    const officers = fakeRepo({
      find: jest.fn(() =>
        Promise.resolve(
          rows.map((b) => ({ bankId: b.id, officerId: OFFICER })),
        ),
      ),
    });
    const users = fakeRepo(over.users ?? {});
    const views = {
      names: jest.fn(() => Promise.resolve(new Map([[OFFICER, 'Officer']]))),
    };
    const chain = fakeTx();
    const applier = { apply: jest.fn(() => Promise.resolve()) };
    const service = new BanksService(
      banks as never,
      officers as never,
      users as never,
      views as never,
      chain.tx as never,
      applier as never,
    );
    return { service, banks, rows, chain, applier };
  };

  it('stores the branch first, then registers its fingerprint on the ledger', async () => {
    const { service, rows, chain, applier } = build();
    const bank = await service.register(admin, dto as never);
    expect(rows[0]).toMatchObject({ ...dto, status: 'submitted' });
    expect(rows[0].detailsHash).toBe(bankFingerprint(rows[0]));
    expect(chain.sent).toEqual([
      {
        signer: admin.keyIndex,
        contract: 'ConsentRegistry',
        method: 'registerBank',
        args: [uuidToBytes32(rows[0].id), rows[0].detailsHash],
      },
    ]);
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(bank.district).toEqual({ code: 'BOGURA', name: 'Bogura' });
    expect(bank.officers).toEqual([{ id: OFFICER, name: 'Officer' }]);
  });

  it('refuses the same branch twice before touching the ledger', async () => {
    const { service, chain } = build({
      banks: { insert: jest.fn(() => Promise.reject(uniqueViolation())) },
    });
    await expect(service.register(admin, dto as never)).rejects.toThrow(
      ConflictException,
    );
    expect(chain.sent).toEqual([]);
  });

  it('removes the stored branch when the ledger refuses it', async () => {
    const { service, banks, chain } = build();
    chain.fail(revert('AlreadyRegistered'));
    await expect(service.register(admin, dto as never)).rejects.toThrow();
    expect(banks.delete).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'submitted' }),
    );
  });

  it('keeps the stored branch when the node fails: the call may still land', async () => {
    const { service, banks, chain } = build();
    chain.fail(new Error('timeout'));
    await expect(service.register(admin, dto as never)).rejects.toThrow(
      'timeout',
    );
    expect(banks.delete).not.toHaveBeenCalled();
  });

  it('shows officers only to staff who manage banks', async () => {
    const { service } = build();
    const created = await service.register(admin, dto as never);
    const seen = await service.one(actor(Role.BANK), created.id);
    expect(seen.officers).toBeUndefined();
  });

  describe('assigning officers', () => {
    const officer = (over: object = {}) => ({
      id: OFFICER,
      role: Role.BANK,
      status: ParticipantStatus.VERIFIED,
      chainState: ChainState.CONFIRMED,
      ...over,
    });

    it.each([
      ['an unknown person', null],
      ['a farmer', officer({ role: Role.FARMER })],
      ['an unverified officer', officer({ status: ParticipantStatus.PENDING })],
      ['an unconfirmed officer', officer({ chainState: ChainState.SUBMITTED })],
    ])('refuses %s', async (_label, person) => {
      const { service, chain } = build({
        users: { findOneBy: jest.fn(() => Promise.resolve(person)) },
      });
      await expect(service.assignOfficer(admin, OFFICER, BANK)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(chain.sent).toEqual([]);
    });

    it('refuses an unknown or unregistered bank', async () => {
      const { service } = build({
        users: { findOneBy: jest.fn(() => Promise.resolve(officer())) },
      });
      await expect(service.assignOfficer(admin, OFFICER, BANK)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes an officer from their bank with the zero id', async () => {
      const { service, chain } = build({
        users: { findOneBy: jest.fn(() => Promise.resolve(officer())) },
      });
      await expect(
        service.assignOfficer(admin, OFFICER, null),
      ).resolves.toBeNull();
      expect(chain.sent[0]).toMatchObject({
        method: 'assignBankOfficer',
        args: [uuidToBytes32(OFFICER), ZERO_BYTES32],
      });
    });
  });

  it('names banks with their branch, in one query', async () => {
    const { service, banks } = build({
      banks: {
        find: jest.fn(() =>
          Promise.resolve([{ id: BANK, name: 'Krishi', branchName: 'Bogura' }]),
        ),
      },
    });
    await expect(service.names([BANK, BANK])).resolves.toEqual(
      new Map([[BANK, 'Krishi, Bogura']]),
    );
    await expect(service.names([])).resolves.toEqual(new Map());
    expect(banks.find).toHaveBeenCalledTimes(1);
  });
});
