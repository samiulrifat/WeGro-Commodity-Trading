import { sign, type SignOptions } from 'jsonwebtoken';
import { fakeRepo, Role } from '../../../test/support/unit';
import { ChainState } from '../users/entities/user.entity';
import { JwtStrategy } from './jwt.strategy';
import { JWT_AUDIENCE, JWT_ISSUER } from './token.service';

const SECRET = 'unit-secret-unit-secret-unit-secret-32';
const USER = {
  id: 'user-1',
  role: Role.INVESTOR,
  status: 'verified',
  chainState: ChainState.CONFIRMED,
  keyIndex: 7,
  mustChangePassword: false,
  tokenVersion: 3,
};

/** The access token check as a request meets it: passport-jwt, then validate(). */
describe('JwtStrategy', () => {
  const strategy = new JwtStrategy(
    { get: () => SECRET } as never,
    fakeRepo({ findOne: jest.fn(() => Promise.resolve(USER)) }) as never,
  );
  type Outcome = { user?: { id: string }; refused?: string };
  const check = (token: string) =>
    new Promise<Outcome>((done) => {
      const s = strategy as unknown as {
        success: (user: { id: string }) => void;
        fail: (info: unknown) => void;
        error: (e: Error) => void;
        authenticate: (req: object) => void;
      };
      s.success = (user) => done({ user });
      s.fail = (info) => done({ refused: String(info) });
      s.error = (e) => done({ refused: e.message });
      s.authenticate({ headers: { authorization: `Bearer ${token}` } });
    });
  const token = (
    over: SignOptions = {},
    secret = SECRET,
    claims: object = { sub: USER.id, role: USER.role, tv: 3 },
  ) =>
    sign(claims, secret, {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: 60,
      ...over,
    });

  it('lets in a token it signed, for the person as they are now', async () => {
    await expect(check(token())).resolves.toEqual({
      user: expect.objectContaining({ id: USER.id, role: USER.role }),
    });
  });

  it('refuses a token signed with another secret, another algorithm or none', async () => {
    for (const forged of [
      token({}, 'someone-elses-secret-someone-elses-32'),
      token({ algorithm: 'HS512' }),
      `${token().split('.').slice(0, 2).join('.')}.`,
    ])
      expect((await check(forged)).refused).toMatch(
        /invalid signature|invalid algorithm|jwt signature is required/,
      );
  });

  it('refuses an expired token, or one for another audience', async () => {
    expect((await check(token({ expiresIn: -10 }))).refused).toMatch(
      /jwt expired/,
    );
    expect((await check(token({ audience: 'other-app' }))).refused).toMatch(
      /jwt audience invalid/,
    );
  });

  it('refuses a token from before the person’s sessions were ended', async () => {
    const old = token({}, SECRET, { sub: USER.id, role: USER.role, tv: 2 });
    expect((await check(old)).refused).toBe('Session is no longer valid');
  });
});
