import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ChainState,
  config,
  fakeRepo,
  ParticipantStatus,
  Role,
} from '../../../test/support/unit';
import type { User } from '../users/entities/user.entity';
import { AuthService, MAX_FAILED_LOGINS } from './auth.service';

const PHONE = '01711000000';

describe('AuthService', () => {
  const build = (
    opts: {
      user?: Partial<User> | null;
      demo?: boolean;
      rehash?: boolean;
    } = {},
  ) => {
    const user =
      opts.user === null
        ? null
        : ({
            id: 'u1',
            role: Role.Farmer,
            status: ParticipantStatus.Verified,
            chainState: ChainState.Confirmed,
            passwordHash: 'hash:right',
            tokenVersion: 0,
            lockedUntil: null,
            ...opts.user,
          } as User);
    const manager = fakeRepo({
      findOneOrFail: jest.fn(() => Promise.resolve(user)),
    });
    manager.transaction = jest.fn((work: (m: unknown) => unknown) =>
      work(manager),
    ) as never;
    const users = fakeRepo({
      findOne: jest.fn(() => Promise.resolve(user)),
      findOneOrFail: jest.fn(() => Promise.resolve(user)),
      manager,
    });
    const hasher = {
      verify: jest.fn((pw: string, hash: string) =>
        Promise.resolve(hash === `hash:${pw}`),
      ),
      verifyDummy: jest.fn(() => Promise.resolve(false)),
      needsRehash: jest.fn(() => opts.rehash ?? false),
      hash: jest.fn((pw: string) => Promise.resolve(`hash:${pw}`)),
    };
    const codec = {
      phoneIndex: jest.fn((p: string) => `idx:${p}`),
      openName: jest.fn(() => 'Rahim Uddin'),
    };
    const tokens = {
      issue: jest.fn(() => Promise.resolve({ accessToken: 'a' })),
      revokeAllForUser: jest.fn(() => Promise.resolve()),
      revokeFamilyOf: jest.fn(() => Promise.resolve()),
    };
    const service = new AuthService(
      config({ DEMO_MODE: opts.demo ?? false }),
      users as never,
      fakeRepo() as never,
      hasher as never,
      codec as never,
      tokens as never,
    );
    return { service, users, manager, hasher, codec, tokens };
  };

  describe('sign-in', () => {
    it('signs in with the right password, clearing failures', async () => {
      const { service, users, codec, tokens } = build();
      const res = await service.login('+8801711000000', 'right');
      expect(codec.phoneIndex).toHaveBeenCalledWith('+8801711000000');
      expect(users.update).toHaveBeenCalledWith(
        { id: 'u1' },
        expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
      );
      expect(res.tokens).toEqual({ accessToken: 'a' });
      expect(tokens.issue).toHaveBeenCalledTimes(1);
    });

    it('spends the same hashing time on an unknown phone, with the same message', async () => {
      const { service, hasher } = build({ user: null });
      const err = await service.login(PHONE, 'x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).toBe(
        'Phone number or password is incorrect',
      );
      expect(hasher.verifyDummy).toHaveBeenCalledTimes(1);
    });

    it('treats a malformed phone as unknown, without a lookup', async () => {
      const { service, users, hasher } = build();
      await expect(service.login('12345', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.findOne).not.toHaveBeenCalled();
      expect(hasher.verifyDummy).toHaveBeenCalled();
    });

    it('counts a wrong password in one statement, against the lockout limit', async () => {
      const { service, manager } = build();
      await expect(service.login(PHONE, 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('"failed_login_count" + 1'),
        ['u1', MAX_FAILED_LOGINS, 60],
      );
    });

    it('refuses a locked account before checking the password', async () => {
      const { service, hasher } = build({
        user: { lockedUntil: new Date(Date.now() + 90_000) },
      });
      const err = await service.login(PHONE, 'right').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as Error).message).toContain('2 minutes');
      expect(hasher.verify).not.toHaveBeenCalled();
    });

    it('only says why an account cannot sign in once the password is right', async () => {
      const rejected = build({ user: { status: ParticipantStatus.Rejected } });
      await expect(rejected.service.login(PHONE, 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(rejected.service.login(PHONE, 'right')).rejects.toThrow(
        new ForbiddenException('This account was not approved'),
      );
      const unconfirmed = build({
        user: { chainState: ChainState.Submitted },
      });
      await expect(unconfirmed.service.login(PHONE, 'right')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets a pending participant sign in to see their status', async () => {
      const { service } = build({
        user: { status: ParticipantStatus.Pending },
      });
      await expect(service.login(PHONE, 'right')).resolves.toBeDefined();
    });

    it('upgrades an old password hash on a good sign-in', async () => {
      const { service, users } = build({ rehash: true });
      await service.login(PHONE, 'right');
      expect(users.update).toHaveBeenCalledWith(
        { id: 'u1' },
        expect.objectContaining({ passwordHash: 'hash:right' }),
      );
    });
  });

  describe('demo sign-in', () => {
    it('does not exist outside demo mode', async () => {
      const { service } = build({ demo: false });
      await expect(service.demoLogin(Role.Admin)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.demoAccounts()).rejects.toThrow(NotFoundException);
    });

    it('signs in as the ready-made account for a role', async () => {
      const { service, users } = build({ demo: true });
      await service.demoLogin(Role.Farmer);
      expect(users.findOne).toHaveBeenCalledWith({
        where: { role: Role.Farmer, isDemo: true },
      });
    });
  });

  describe('changing the password', () => {
    it('counts a wrong current password like a failed sign-in', async () => {
      const { service, manager } = build();
      await expect(
        service.changePassword('u1', 'wrong', 'new-password-1'),
      ).rejects.toThrow(BadRequestException);
      expect(manager.query).toHaveBeenCalled();
    });

    it('refuses the same password, however it is typed', async () => {
      const { service } = build({ user: { passwordHash: 'hash:ｐａｓｓ' } });
      await expect(
        service.changePassword('u1', 'ｐａｓｓ', 'pass'),
      ).rejects.toThrow('New password must differ from the current one');
    });

    it('replaces the hash, ends every session and starts a new one', async () => {
      const { service, manager, tokens } = build();
      await service.changePassword('u1', 'right', 'new-password-1');
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'u1' },
        expect.objectContaining({
          passwordHash: 'hash:new-password-1',
          mustChangePassword: false,
        }),
      );
      expect(manager.increment).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'u1' },
        'tokenVersion',
        1,
      );
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1', manager);
      expect(tokens.issue).toHaveBeenCalled();
    });
  });

  it('signs out everywhere by bumping the token version and revoking refresh tokens', async () => {
    const { service, manager, tokens } = build();
    await service.logoutEverywhere('u1');
    expect(manager.increment).toHaveBeenCalled();
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1', manager);
  });

  it('signs out one session only when a token is presented', async () => {
    const { service, tokens } = build();
    await service.logout(undefined);
    expect(tokens.revokeFamilyOf).not.toHaveBeenCalled();
    await service.logout('t');
    expect(tokens.revokeFamilyOf).toHaveBeenCalledWith('t');
  });
});
