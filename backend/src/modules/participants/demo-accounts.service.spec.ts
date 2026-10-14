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
  Role.Admin,
  Role.FieldOfficer,
  Role.Accounts,
  Role.Operations,
  Role.Auditor,
];
const OTHERS = [
  Role.Farmer,
  Role.Investor,
  Role.Warehouse,
  Role.Bank,
  Role.Supplier,
  Role.Buyer,
  Role.Insurer,
];

/** Users in memory; registering adds a pending one, verifying verifies it. */
function world(existing: Partial<User>[] = []) {
  const users: User[] = existing.map(
    (u, i) =>
      ({
        id: `existing-${i}`,
        isDemo: true,
        status: ParticipantStatus.Verified,
        chainState: ChainState.Confirmed,
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
    findOne: jest.fn(({ where }: { where: Partial<User> }) =>
      Promise.resolve(find(where)),
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
        status: ParticipantStatus.Pending,
        chainState: ChainState.Confirmed,
        keyIndex: users.length + 10,
      } as User);
      registered.push({ role: dto.role, by: by.role });
      return Promise.resolve({ participant: { id } });
    }),
    verify: jest.fn((_by: unknown, id: string) => {
      find({ id })!.status = ParticipantStatus.Verified;
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
        ? Role.SuperAdmin
        : r.role === Role.Farmer
          ? Role.FieldOfficer
          : Role.Admin;
      expect(r.by).toBe(expected);
    }
    const accounts = w.users.filter((u) => u.role !== Role.SuperAdmin);
    expect(accounts.every((u) => u.status === ParticipantStatus.Verified)).toBe(
      true,
    );
    expect(accounts.every((u) => u.isDemo && !u.mustChangePassword)).toBe(true);
    // A demo super admin only because none existed.
    expect(w.users.find((u) => u.role === Role.SuperAdmin)).toMatchObject({
      isDemo: true,
      chainState: ChainState.Operator,
      keyIndex: 0,
    });
  });

  it('keeps a real super admin and brings existing demo accounts back onto the ledger', async () => {
    const all = [Role.SuperAdmin, ...STAFF, ...OTHERS].map((role) => ({
      role,
      isDemo: role !== Role.SuperAdmin,
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
    const all = [Role.SuperAdmin, ...STAFF, ...OTHERS].map((role) => ({
      role,
      isDemo: true,
      status:
        role === Role.Buyer
          ? ParticipantStatus.Pending
          : ParticipantStatus.Verified,
    }));
    const w = world(all);
    await build(w).ensureAll();
    expect(w.participants.verify).toHaveBeenCalledTimes(1);
  });

  it('does nothing at startup outside demo mode', () => {
    const w = world();
    build(w, false).onApplicationBootstrap();
    expect(w.repo.findOne).not.toHaveBeenCalled();
  });
});
