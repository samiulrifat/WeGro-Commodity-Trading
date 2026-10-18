import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { config, Role } from '../../../test/support/unit';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JWT_AUDIENCE, JWT_ISSUER, TokenService } from './token.service';

const SECRET = 'unit-test-secret-unit-test-secret';

/** Refresh tokens in memory, with the conditional update the service relies on. */
function tokenStore() {
  const rows: RefreshToken[] = [];
  const versionBumps: string[] = [];
  const matches = (row: RefreshToken, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      // IsNull() is the only operator used: an object with a _type.
      v && typeof v === 'object' && '_type' in v
        ? row[k as keyof RefreshToken] === null
        : row[k as keyof RefreshToken] === v,
    );
  const manager = {
    findOne: (_e: unknown, { where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    update: (
      _e: unknown,
      where: Record<string, unknown>,
      patch: Partial<RefreshToken>,
    ) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, patch));
      return Promise.resolve({ affected: hit.length });
    },
    insert: (_e: unknown, row: RefreshToken) => {
      rows.push({ ...row, id: String(rows.length + 1) });
      return Promise.resolve({});
    },
    increment: (entity: unknown, where: { id: string }) => {
      if (entity === User) versionBumps.push(where.id);
      return Promise.resolve({});
    },
    transaction: (work: (m: unknown) => unknown) => work(manager),
  };
  const repo = {
    manager,
    findOne: ({ where }: { where: Record<string, unknown> }) =>
      manager.findOne(RefreshToken, { where }),
    update: (where: Record<string, unknown>, patch: Partial<RefreshToken>) =>
      manager.update(RefreshToken, where, patch),
  };
  return { rows, repo, versionBumps };
}

describe('TokenService', () => {
  const jwt = new JwtService({ secret: SECRET });
  const build = (ttl = '15m') => {
    const store = tokenStore();
    const service = new TokenService(
      config({ JWT_EXPIRES_IN: ttl, REFRESH_TOKEN_TTL_DAYS: 30 }),
      jwt,
      store.repo as never,
    );
    jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    return { service, ...store };
  };
  const user = { id: 'u1', role: Role.INVESTOR, tokenVersion: 3 } as User;
  const loadUser = () => Promise.resolve(user);

  it('signs a short-lived access token with role and token version', async () => {
    const { service, rows } = build('15m');
    const t = await service.issue(user);
    expect(t.expiresIn).toBe(900);
    const claims = await jwt.verifyAsync<Record<string, unknown>>(
      t.accessToken,
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    );
    expect(claims).toMatchObject({ sub: 'u1', role: Role.INVESTOR, tv: 3 });
    // Only a hash of the refresh token is stored.
    expect(t.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(t.refreshToken);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads hour and second lifetimes too', async () => {
    await expect(build('2h').service.issue(user)).resolves.toMatchObject({
      expiresIn: 7200,
    });
    await expect(build('45s').service.issue(user)).resolves.toMatchObject({
      expiresIn: 45,
    });
  });

  it('rotates a refresh token within its session, and it works once', async () => {
    const { service, rows } = build();
    const first = await service.issue(user);
    const next = await service.rotate(first.refreshToken, loadUser);
    expect(next.user).toBe(user);
    expect(rows).toHaveLength(2);
    expect(rows[1].familyId).toBe(rows[0].familyId);
    expect(rows[0].revokedAt).toBeInstanceOf(Date);
  });

  it('treats a reused refresh token as theft: ends the session and voids access tokens', async () => {
    const { service, rows, versionBumps } = build();
    const first = await service.issue(user);
    const second = await service.rotate(first.refreshToken, loadUser);
    await expect(
      service.rotate(first.refreshToken, loadUser),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows.every((r) => r.revokedAt)).toBe(true);
    expect(versionBumps).toEqual(['u1']);
    // The thief's newer token is dead too.
    await expect(
      service.rotate(second.tokens.refreshToken, loadUser),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses malformed, unknown and expired tokens without revoking anything', async () => {
    const { service, rows, versionBumps } = build();
    await expect(service.rotate('short', loadUser)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.rotate('A'.repeat(43), loadUser)).rejects.toThrow(
      UnauthorizedException,
    );
    const t = await service.issue(user);
    rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.rotate(t.refreshToken, loadUser)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(rows[0].revokedAt).toBeNull();
    expect(versionBumps).toEqual([]);
  });

  it('refuses when the person may no longer sign in', async () => {
    const { service } = build();
    const t = await service.issue(user);
    await expect(
      service.rotate(t.refreshToken, () => Promise.resolve(null)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('signs out one session, or every session of a person', async () => {
    const { service, rows } = build();
    const a = await service.issue(user);
    await service.issue(user);
    await service.revokeFamilyOf(a.refreshToken);
    expect(rows.map((r) => !!r.revokedAt)).toEqual([true, false]);
    await service.revokeFamilyOf('not-a-token'); // ignored
    await service.revokeAllForUser('u1');
    expect(rows.every((r) => r.revokedAt)).toBe(true);
  });
});
