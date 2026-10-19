import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidToBytes32, ZERO_BYTES32 } from '../../blockchain/utils/ids';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import {
  actor,
  ChainState,
  config,
  fakeRepo,
  fakeTx,
  matchesWhere,
  ParticipantStatus,
  revert,
  Role,
} from '../../../test/support/unit';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { CHAIN_ROLE } from '../users/roles';
import { ParticipantsService } from './participants.service';

const codec = new PersonalDetailsCodec(
  new IdentityCryptoService(config({ IDENTITY_MASTER_KEY: 'ab'.repeat(32) })),
);

const person = {
  fullName: 'Rahim Uddin',
  phone: '01711000001',
  nid: '5839204716',
  dateOfBirth: '1980-05-05',
  district: 'BOGURA',
  address: 'Village 1, Shibganj, Bogura',
};

/**
 * People and their encrypted details in memory, and a ledger that records
 * what registration sent and answers getParticipant from it.
 */
function world() {
  const users: User[] = [];
  const details: PersonalDetails[] = [];
  const ledger = new Map<
    string,
    { status: number; role: string; account: string; detailsHash: string }
  >();
  const find = (id: string) => users.find((u) => u.id === id) ?? null;
  const manager = fakeRepo({
    insert: jest.fn((entity: unknown, row: object) => {
      // Column defaults the database would fill in.
      if (entity === User)
        users.push({
          pendingKeyIndex: null,
          fieldOfficerId: null,
          statusReason: null,
          tokenVersion: 0,
          ...row,
        } as User);
      if (entity === PersonalDetails) details.push(row as PersonalDetails);
      return Promise.resolve({});
    }),
    update: jest.fn((_e: unknown, where: { id: string }, patch: object) => {
      Object.assign(find(where.id)!, patch);
      return Promise.resolve({ affected: 1 });
    }),
  });
  const usersRepo = fakeRepo({
    exists: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(users.some((u) => matchesWhere(u as never, where))),
    ),
    findOne: jest.fn(({ where }: { where: { id: string } }) => {
      const u = find(where.id);
      return Promise.resolve(
        u && {
          ...u,
          details: details.find((d) => d.userId === u.id) ?? null,
        },
      );
    }),
    update: jest.fn(({ id }: { id: string }, patch: object) => {
      Object.assign(find(id)!, patch);
      return Promise.resolve({ affected: 1 });
    }),
    delete: jest.fn(({ id }: { id: string }) => {
      users.splice(users.indexOf(find(id)!), 1);
      return Promise.resolve({ affected: 1 });
    }),
  });
  const detailsRepo = fakeRepo({
    exists: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(details.some((d) => matchesWhere(d as never, where))),
    ),
  });
  const chain = fakeTx((call) => {
    const [id] = call.args as [string];
    if (call.method === 'registerParticipant') {
      const [, role, account, detailsHash] = call.args as string[];
      ledger.set(id, { status: 1, role, account, detailsHash });
    }
    if (call.method === 'verifyParticipant') ledger.get(id)!.status = 2;
    if (call.method === 'rejectParticipant') ledger.get(id)!.status = 3;
    return [];
  });
  // The receipt applier would copy ledger events into the users table.
  const receipts = {
    apply: jest.fn(() => {
      for (const u of users) {
        const l = ledger.get(uuidToBytes32(u.id));
        if (!l) continue;
        u.chainState = ChainState.CONFIRMED;
        u.status = (['', 'pending', 'verified', 'rejected'] as const)[
          l.status
        ] as ParticipantStatus;
      }
      return Promise.resolve();
    }),
    announce: jest.fn(() => Promise.resolve()),
  };
  const contracts = {
    get: () => ({
      getParticipant: jest.fn((id: string) =>
        Promise.resolve(
          ledger.get(id) ?? {
            status: 0,
            role: ZERO_BYTES32,
            account: '0x0000000000000000000000000000000000000000',
            detailsHash: ZERO_BYTES32,
          },
        ),
      ),
    }),
  };
  let nextKey = 100;
  const keys = {
    allocateIndex: jest.fn(() => Promise.resolve(++nextKey)),
    addressOf: (i: number) => `0x${String(i).padStart(40, '0')}`,
  };
  const tokens = { revokeAllForUser: jest.fn(() => Promise.resolve()) };
  const sms = { send: jest.fn(() => Promise.resolve()) };
  const dataSource = {
    transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
  };
  const service = new ParticipantsService(
    dataSource as never,
    usersRepo as never,
    detailsRepo as never,
    codec,
    { hash: (pw: string) => Promise.resolve(`hash:${pw}`) } as never,
    keys as never,
    chain.tx as never,
    contracts as never,
    receipts as never,
    tokens as never,
    sms as never,
    {} as never,
  );
  jest
    .spyOn(
      (service as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    )
    .mockImplementation(() => undefined);
  return { service, users, details, ledger, chain, tokens, usersRepo, sms };
}

describe('ParticipantsService', () => {
  const admin = actor(Role.ADMIN);
  const superAdmin = actor(Role.SUPER_ADMIN, { keyIndex: 0 });
  const officer = actor(Role.FIELD_OFFICER);

  describe('registering', () => {
    it('saves encrypted details and registers the fingerprint and a fresh key on the ledger', async () => {
      const w = world();
      const res = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      const user = w.users[0];
      expect(user).toMatchObject({
        role: Role.FARMER,
        mustChangePassword: true,
        keyIndex: 101,
        registeredById: admin.id,
        chainState: ChainState.CONFIRMED,
      });
      const stored = w.details[0];
      expect(JSON.stringify(stored)).not.toContain('Rahim');
      expect(stored.detailsHash).toBe(
        codec.fingerprint(user.id, Role.FARMER, codec.open(stored) as never),
      );
      expect(w.chain.sent[0]).toMatchObject({
        method: 'registerParticipant',
        args: [
          uuidToBytes32(user.id),
          CHAIN_ROLE[Role.FARMER],
          user.account,
          stored.detailsHash,
        ],
      });
      expect(res.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);
      expect(user.passwordHash).toBe(`hash:${res.temporaryPassword}`);
      // Texted to them as well, in the language chosen for them.
      expect(res.smsSent).toBe(true);
      expect(w.sms.send).toHaveBeenCalledWith(
        '+8801711000001',
        expect.stringContaining(res.temporaryPassword),
      );
    });

    it('lets only the super admin register staff, field officers farmers, and admins everyone else', async () => {
      const w = world();
      await expect(
        w.service.register(admin, { role: Role.ACCOUNTS, ...person } as never),
      ).rejects.toThrow(ForbiddenException);
      const refused = await w.service
        .register(officer, { role: Role.INVESTOR, ...person } as never)
        .catch((e: ForbiddenException) => e.getResponse());
      expect(refused).toMatchObject({ code: 'FIELD_OFFICER_FARMERS_ONLY' });
      await expect(
        w.service.register(actor(Role.INVESTOR), {
          role: Role.FARMER,
          ...person,
        } as never),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        w.service.register(officer, { role: Role.FARMER, ...person } as never),
      ).resolves.toBeDefined();
    });

    it('stops at a failed ID check, listing only the failures', async () => {
      const err = await world()
        .service.register(admin, {
          role: Role.FARMER,
          ...person,
          phone: '12345',
        } as never)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as {
        code: string;
        details: { checks: Array<{ result: string }> };
      };
      expect(body.code).toBe('ID_CHECK_FAILED');
      expect(body.details.checks.every((c) => c.result === 'fail')).toBe(true);
    });

    it('refuses a phone or NID already registered', async () => {
      const w = world();
      await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      const again = (over: object) =>
        w.service
          .register(admin, { role: Role.INVESTOR, ...person, ...over } as never)
          .catch((e: ConflictException) => e.getResponse());
      await expect(again({ nid: '7192835460' })).resolves.toMatchObject({
        code: 'PHONE_ALREADY_REGISTERED',
      });
      await expect(again({ phone: '01711000002' })).resolves.toMatchObject({
        code: 'NID_ALREADY_REGISTERED',
      });
    });

    it('removes the saved person when the ledger refuses the registration', async () => {
      const w = world();
      w.chain.fail(revert('AccountInUse'));
      await expect(
        w.service.register(admin, { role: Role.FARMER, ...person } as never),
      ).rejects.toThrow();
      expect(w.users).toEqual([]);
    });

    it('keeps the person as submitted when the node fails, still handing over the password', async () => {
      const w = world();
      w.chain.fail(new Error('timeout'));
      const res = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      expect(res.participant.chainState).toBe(ChainState.SUBMITTED);
      expect(res.temporaryPassword).toBeTruthy();
      expect(w.users[0].chainState).toBe(ChainState.SUBMITTED);
    });

    it('registers even when the SMS cannot be sent, and says so', async () => {
      const w = world();
      w.sms.send.mockRejectedValueOnce(new Error('gateway down'));
      jest
        .spyOn(
          (w.service as unknown as { logger: { error: () => void } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);
      const res = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      expect(res.smsSent).toBe(false);
      expect(res.participant.id).toBeTruthy();
    });
  });

  describe('verifying', () => {
    const registered = async () => {
      const w = world();
      const { participant } = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      return { ...w, id: participant.id };
    };

    it('verifies on the ledger once the stored details still match it', async () => {
      const w = await registered();
      const res = await w.service.verify(admin, w.id);
      expect(res.status).toBe(ParticipantStatus.VERIFIED);
      expect(w.chain.methods()).toEqual([
        'registerParticipant',
        'verifyParticipant',
      ]);
    });

    it('refuses when the stored details were changed after registration', async () => {
      const w = await registered();
      w.details[0].detailsHash = '0x' + '1'.repeat(64);
      const err = await w.service
        .verify(admin, w.id)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'DETAILS_MISMATCH',
        details: { mismatches: ['storedHash'] },
      });
    });

    it('needs ID-check flags acknowledged', async () => {
      const w = await registered();
      w.details[0].idCheck = {
        version: 1,
        outcome: 'flagged',
        checks: [{ code: 'X', result: 'warn', message: 'look' }],
      } as never;
      await expect(w.service.verify(admin, w.id)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(w.service.verify(admin, w.id, true)).resolves.toBeDefined();
    });

    it('lets only an admin verify participants, and the super admin staff', async () => {
      const w = await registered();
      await expect(w.service.verify(officer, w.id)).rejects.toThrow(
        'Only admins manage participants',
      );
      await expect(w.service.verify(superAdmin, w.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  it('rejects on the ledger and ends every session the person had', async () => {
    const w = world();
    const { participant } = await w.service.register(admin, {
      role: Role.INVESTOR,
      ...person,
    } as never);
    await w.service.reject(admin, participant.id, 'Documents do not match');
    expect(w.users[0]).toMatchObject({
      status: ParticipantStatus.REJECTED,
      statusReason: 'Documents do not match',
    });
    expect(w.tokens.revokeAllForUser).toHaveBeenCalledWith(
      participant.id,
      expect.anything(),
    );
  });

  it('only assigns a verified field officer to a farmer', async () => {
    const w = world();
    const { participant } = await w.service.register(admin, {
      role: Role.INVESTOR,
      ...person,
    } as never);
    await expect(
      w.service.assignFieldOfficer(admin, participant.id, officer.id),
    ).rejects.toThrow(
      new BadRequestException('Only farmers have a field officer'),
    );
  });

  it('marks the new key pending before replacing a key, and clears it if the ledger refuses', async () => {
    const w = world();
    const { participant } = await w.service.register(admin, {
      role: Role.FARMER,
      ...person,
    } as never);
    w.chain.fail(revert('AccountInUse'));
    await expect(w.service.replaceKey(admin, participant.id)).rejects.toThrow();
    expect(w.usersRepo.update.mock.calls.map((c) => c[1])).toEqual([
      { pendingKeyIndex: 102 },
      { pendingKeyIndex: null },
    ]);
  });

  describe('syncing with the ledger', () => {
    it('registers again someone the ledger has lost (a reset chain)', async () => {
      const w = world();
      const { participant } = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      w.ledger.clear();
      await w.service.syncWithLedger(admin, participant.id);
      expect(w.chain.methods()).toEqual([
        'registerParticipant',
        'registerParticipant',
      ]);
    });

    it('refuses to copy a ledger record that belongs to a different person', async () => {
      const w = world();
      const { participant } = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      w.ledger.get(uuidToBytes32(participant.id))!.detailsHash =
        '0x' + '2'.repeat(64);
      await expect(
        w.service.syncWithLedger(admin, participant.id),
      ).rejects.toThrow('The ledger record does not match this person');
    });
  });

  describe('reading', () => {
    it('masks phone, NID, birth date and address for auditors', async () => {
      const w = world();
      const { participant } = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      const seen = await w.service.findOne(actor(Role.AUDITOR), participant.id);
      expect(seen).toMatchObject({
        masked: true,
        phone: '+88017•••••001',
        nid: '••••••4716',
        dateOfBirth: null,
        address: null,
      });
      const full = await w.service.findOne(admin, participant.id);
      expect(full).toMatchObject({ masked: false, nid: '5839204716' });
    });

    it('shows field officers only the people they register or look after', async () => {
      const w = world();
      const { participant } = await w.service.register(admin, {
        role: Role.FARMER,
        ...person,
      } as never);
      await expect(w.service.findOne(officer, participant.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never shows the super admin as a participant', async () => {
      const w = world();
      w.users.push({ id: 'sa', role: Role.SUPER_ADMIN } as User);
      await expect(w.service.findOne(admin, 'sa')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('reports every way stored details and the ledger disagree', async () => {
    const w = world();
    const { participant } = await w.service.register(admin, {
      role: Role.FARMER,
      ...person,
    } as never);
    w.users[0].status = ParticipantStatus.VERIFIED; // database says verified, ledger pending
    const res = await w.service.integrity(participant.id);
    expect(res).toMatchObject({ matches: false, mismatches: ['status'] });
  });

  it('stops a second key replacement while one is in progress', async () => {
    const w = world();
    const { participant } = await w.service.register(admin, {
      role: Role.FARMER,
      ...person,
    } as never);
    w.users[0].pendingKeyIndex = 5;
    await expect(w.service.replaceKey(admin, participant.id)).rejects.toThrow(
      ConflictException,
    );
  });
});
