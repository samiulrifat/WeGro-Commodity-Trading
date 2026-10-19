import {
  ChainState,
  config,
  fakeRepo,
  ParticipantStatus,
  Role,
} from '../../../test/support/unit';
import type { User } from '../users/entities/user.entity';
import { DemoAccountsService } from './demo-accounts.service';

const STAFF = [
  Role.ADMIN,
  Role.FIELD_OFFICER,
  Role.ACCOUNTS,
  Role.OPERATIONS,
  Role.AUDITOR,
];
const OTHERS = [
  Role.FARMER,
  Role.INVESTOR,
  Role.WAREHOUSE,
  Role.BANK,
  Role.SUPPLIER,
  Role.BUYER,
  Role.INSURER,
];

/** Users in memory; registering adds a pending one, verifying verifies it. */
function world(existing: Partial<User>[] = []) {
  const users: User[] = existing.map(
    (u, i) =>
      ({
        id: `existing-${i}`,
        isDemo: true,
        status: ParticipantStatus.VERIFIED,
        chainState: ChainState.CONFIRMED,
        keyIndex: i + 1,
        ...u,
      }) as User,
  );
  const find = (where: Partial<User>) =>
    users.find((u) =>
      Object.entries(where).every(([k, v]) => u[k as keyof User] === v),
    ) ?? null;
  const manager = fakeRepo({
    save: jest.fn((u: User) => {
      u.id = 'super';
      users.push(u);
      return Promise.resolve(u);
    }),
  });
  manager.transaction = jest.fn((w: (m: unknown) => unknown) =>
    w(manager),
  ) as never;
  const repo = fakeRepo({
    manager,
    create: jest.fn((u: Partial<User>) => ({ ...u }) as User),
    // A list of conditions matches any one of them, as in TypeORM.
    findOne: jest.fn(({ where }: { where: Partial<User> | Partial<User>[] }) =>
      Promise.resolve(
        [where].flat().reduce<User | null>((u, w) => u ?? find(w), null),
      ),
    ),
    findOneByOrFail: jest.fn((where: Partial<User>) => {
      const u = find(where);
      return u ? Promise.resolve(u) : Promise.reject(new Error('none'));
    }),
    update: jest.fn(({ id }: { id: string }, patch: Partial<User>) => {
      Object.assign(find({ id })!, patch);
      return Promise.resolve({ affected: 1 });
    }),
  });
  const registered: Array<{ role: Role; by: Role }> = [];
  const participants = {
    register: jest.fn((by: { role: Role }, dto: { role: Role }) => {
      const id = `${dto.role}-id`;
      users.push({
        id,
        role: dto.role,
        status: ParticipantStatus.PENDING,
        chainState: ChainState.CONFIRMED,
        keyIndex: users.length + 10,
      } as User);
      registered.push({ role: dto.role, by: by.role });
      return Promise.resolve({ participant: { id } });
    }),
    verify: jest.fn((_by: unknown, id: string) => {
      find({ id })!.status = ParticipantStatus.VERIFIED;
      return Promise.resolve();
    }),
    syncWithLedger: jest.fn(() => Promise.resolve()),
  };
  return { users, repo, manager, participants, registered };
}

describe('DemoAccountsService', () => {
  const build = (w: ReturnType<typeof world>, demo = true) => {
    const service = new DemoAccountsService(
      config({ DEMO_MODE: demo }),
      w.repo as never,
      w.participants as never,
      {
        phoneIndex: (p: string) => `idx:${p}`,
        sealOperator: () => ({}),
      } as never,
      { hash: () => Promise.resolve('unusable') } as never,
      { operatorAddress: () => '0xoperator' } as never,
    );
    return service;
  };

  it('creates one verified account per role: staff by the super admin, the farmer by the officer', async () => {
    const w = world();
    await build(w).ensureAll();
    expect(w.registered.map((r) => r.role)).toEqual([...STAFF, ...OTHERS]);
    for (const r of w.registered) {
      const expected = STAFF.includes(r.role)
        ? Role.SUPER_ADMIN
        : r.role === Role.FARMER
          ? Role.FIELD_OFFICER
          : Role.ADMIN;
      expect(r.by).toBe(expected);
    }
    const accounts = w.users.filter((u) => u.role !== Role.SUPER_ADMIN);
    expect(accounts.every((u) => u.status === ParticipantStatus.VERIFIED)).toBe(
      true,
    );
    expect(accounts.every((u) => u.isDemo && !u.mustChangePassword)).toBe(true);
    // A demo super admin only because none existed.
    expect(w.users.find((u) => u.role === Role.SUPER_ADMIN)).toMatchObject({
      isDemo: true,
      chainState: ChainState.OPERATOR,
      keyIndex: 0,
    });
  });

  it('keeps a real super admin and brings existing demo accounts back onto the ledger', async () => {
    const all = [Role.SUPER_ADMIN, ...STAFF, ...OTHERS].map((role) => ({
      role,
      isDemo: role !== Role.SUPER_ADMIN,
    }));
    const w = world(all);
    await build(w).ensureAll();
    expect(w.participants.register).not.toHaveBeenCalled();
    expect(w.manager.save).not.toHaveBeenCalled();
    expect(w.participants.syncWithLedger).toHaveBeenCalledTimes(
      STAFF.length + OTHERS.length,
    );
    expect(w.participants.verify).not.toHaveBeenCalled();
  });

  it('verifies an existing demo account left unverified', async () => {
    const all = [Role.SUPER_ADMIN, ...STAFF, ...OTHERS].map((role) => ({
      role,
      isDemo: true,
      status:
        role === Role.BUYER
          ? ParticipantStatus.PENDING
          : ParticipantStatus.VERIFIED,
    }));
    const w = world(all);
    await build(w).ensureAll();
    expect(w.participants.verify).toHaveBeenCalledTimes(1);
  });

  it('takes over an account an earlier start registered but did not mark', async () => {
    const all = [Role.SUPER_ADMIN, ...STAFF, ...OTHERS].map((role) => ({
      role,
      isDemo: role !== Role.SUPER_ADMIN,
    }));
    // The ledger was slow: saved, still pending, not yet marked as a demo.
    Object.assign(all[1], {
      isDemo: false,
      status: ParticipantStatus.PENDING,
      phoneIndex: 'idx:+8801700000001',
      mustChangePassword: true,
    });
    const w = world(all);
    await build(w).ensureAll();
    expect(w.participants.register).not.toHaveBeenCalled();
    expect(w.users.find((u) => u.role === Role.ADMIN)).toMatchObject({
      isDemo: true,
      mustChangePassword: false,
      status: ParticipantStatus.VERIFIED,
    });
  });

  it('does nothing at startup outside demo mode', () => {
    const w = world();
    build(w, false).onApplicationBootstrap();
    expect(w.repo.findOne).not.toHaveBeenCalled();
  });
});
