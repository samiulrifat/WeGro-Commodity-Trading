import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  actor,
  fakeDataSource,
  fakeRepo,
  Role,
} from '../../../test/support/unit';
import { BankAccountsService } from './bank-accounts.service';
import {
  type BankAccount,
  BankAccountStatus,
} from './entities/bank-account.entity';

const PAYEE = 'f1';
const DETAILS = {
  holderName: 'Rahim Uddin',
  bankName: 'Krishi Bank',
  branchName: 'Bogura',
  accountNumber: '0012345678',
  routingNumber: '035100000',
};

/** Bank accounts in memory, with the conditional updates the service relies on. */
function store() {
  const rows: BankAccount[] = [];
  let clock = 0;
  const match = (r: BankAccount, where: Partial<BankAccount>) =>
    Object.entries(where).every(([k, v]) => {
      const value = r[k as keyof BankAccount];
      // In(...) is the only operator used here.
      if (v && typeof v === 'object' && '_type' in v && v._type === 'in') {
        return (v as unknown as { _value: unknown[] })._value.includes(value);
      }
      return value === v;
    });
  const update = (where: Partial<BankAccount>, patch: Partial<BankAccount>) => {
    const hit = rows.filter((r) => match(r, where));
    hit.forEach((r) => Object.assign(r, patch));
    return Promise.resolve({ affected: hit.length });
  };
  const manager = fakeRepo({
    update: jest.fn((_e: unknown, w: Partial<BankAccount>, p: object) =>
      update(w, p),
    ),
    insert: jest.fn((_e: unknown, row: BankAccount) => {
      rows.push({
        ...row,
        createdAt: new Date(++clock * 1000),
        decidedById: null,
        decidedAt: null,
        rejectionReason: null,
      });
      return Promise.resolve({});
    }),
  });
  const accounts = fakeRepo({
    update: jest.fn(update),
    findOneBy: jest.fn((w: Partial<BankAccount>) =>
      Promise.resolve(rows.find((r) => match(r, w)) ?? null),
    ),
    find: jest.fn(({ where }: { where: Partial<BankAccount> }) =>
      Promise.resolve(
        rows
          .filter((r) => match(r, where))
          .sort((a, b) => +b.createdAt - +a.createdAt),
      ),
    ),
  });
  return { rows, manager, accounts };
}

describe('BankAccountsService', () => {
  const admin = actor(Role.ADMIN);
  const otherAdmin = actor(Role.ADMIN);

  const build = (payeeRole: Role | null = Role.FARMER) => {
    const s = store();
    const users = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve(payeeRole ? { id: PAYEE, role: payeeRole } : null),
      ),
    });
    const crypto = {
      encrypt: (text: string, ctx: string) => `enc[${ctx}]${text}`,
      decrypt: (enc: string, ctx: string) => {
        const prefix = `enc[${ctx}]`;
        if (!enc.startsWith(prefix)) throw new Error('wrong context');
        return enc.slice(prefix.length);
      },
    };
    const writer = {
      send: jest.fn(() => Promise.resolve(1)),
      withRole: jest.fn(() => Promise.resolve([otherAdmin.id])),
    };
    const service = new BankAccountsService(
      fakeDataSource(s.manager) as never,
      s.accounts as never,
      users as never,
      crypto as never,
      { names: () => Promise.resolve(new Map()) } as never,
      writer as never,
    );
    jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    return { service, writer, ...s };
  };

  it('keeps details encrypted, bound to their row, until another admin verifies them', async () => {
    const { service, rows, writer } = build();
    const res = await service.submit(admin, PAYEE, DETAILS as never);
    expect(rows[0].detailsEnc).toBe(
      `enc[bank_accounts.details:${rows[0].id}]${JSON.stringify(DETAILS)}`,
    );
    expect(res.pending).toMatchObject({ ...DETAILS, status: 'pending' });
    expect(res.verified).toBeNull();
    // Other admins are asked to verify.
    expect(writer.withRole).toHaveBeenCalledWith(
      expect.anything(),
      [Role.ADMIN],
      [admin.id],
    );
    await expect(service.verify(admin, PAYEE)).rejects.toThrow(
      ForbiddenException,
    );
    const done = await service.verify(otherAdmin, PAYEE);
    expect(done.verified).toMatchObject({ status: 'verified' });
    expect(done.pending).toBeNull();
  });

  it('replaces details still waiting, and keeps the verified ones until the new are verified', async () => {
    const { service, rows } = build();
    await service.submit(admin, PAYEE, DETAILS as never);
    await service.verify(otherAdmin, PAYEE);
    await service.submit(admin, PAYEE, {
      ...DETAILS,
      accountNumber: '1',
    } as never);
    await service.submit(admin, PAYEE, {
      ...DETAILS,
      accountNumber: '2',
    } as never);
    expect(rows.map((r) => r.status)).toEqual([
      BankAccountStatus.VERIFIED,
      BankAccountStatus.SUPERSEDED,
      BankAccountStatus.PENDING,
    ]);
    await service.verify(otherAdmin, PAYEE);
    expect(rows.map((r) => r.status)).toEqual([
      BankAccountStatus.SUPERSEDED,
      BankAccountStatus.SUPERSEDED,
      BankAccountStatus.VERIFIED,
    ]);
  });

  it('refuses to re-enter details that are already verified', async () => {
    const { service } = build();
    await service.submit(admin, PAYEE, DETAILS as never);
    await service.verify(otherAdmin, PAYEE);
    await expect(
      service.submit(admin, PAYEE, DETAILS as never),
    ).rejects.toThrow(ConflictException);
  });

  it('records why details were rejected', async () => {
    const { service, rows } = build();
    await service.submit(admin, PAYEE, DETAILS as never);
    const res = await service.reject(otherAdmin, PAYEE, 'Name does not match');
    expect(rows[0]).toMatchObject({
      status: BankAccountStatus.REJECTED,
      rejectionReason: 'Name does not match',
    });
    expect(res.history).toHaveLength(1);
    await expect(service.reject(otherAdmin, PAYEE, 'x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('shows full numbers to admins and the payee, and the last four to others', async () => {
    const { service } = build();
    await service.submit(admin, PAYEE, DETAILS as never);
    const own = await service.forUser(actor(Role.FARMER, { id: PAYEE }), PAYEE);
    expect(own.pending?.accountNumber).toBe('0012345678');
    const officer = await service.forUser(actor(Role.FIELD_OFFICER), PAYEE);
    expect(officer.pending?.accountNumber).toBe('••••••5678');
  });

  it('only farmers and investors have accounts', async () => {
    await expect(
      build(Role.BUYER).service.submit(admin, PAYEE, DETAILS as never),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(build(null).service.forUser(admin, PAYEE)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('gives a payout sheet verified details and flags pending changes', async () => {
    const { service } = build();
    await service.submit(admin, PAYEE, DETAILS as never);
    await service.verify(otherAdmin, PAYEE);
    await service.submit(admin, PAYEE, {
      ...DETAILS,
      accountNumber: '9',
    } as never);
    const { verified, pendingChange } = await service.forPayout([PAYEE, PAYEE]);
    expect(verified.get(PAYEE)).toMatchObject(DETAILS);
    expect(pendingChange.has(PAYEE)).toBe(true);
    await expect(service.forPayout([])).resolves.toEqual({
      verified: new Map(),
      pendingChange: new Set(),
    });
  });

  it('keeps the change when the notice fails', async () => {
    const { service, writer, rows } = build();
    writer.send.mockRejectedValueOnce(new Error('db hiccup'));
    await expect(
      service.submit(admin, PAYEE, DETAILS as never),
    ).resolves.toBeDefined();
    expect(rows).toHaveLength(1);
  });
});
