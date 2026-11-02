import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { fakeRepo } from '../../test/support/unit';
import { PasswordHasher } from '../common/crypto/password-hasher.service';
import { PersonalDetailsCodec } from '../modules/users/personal-details.codec';
import { ensureSuperAdmin, readPassword } from './super-admin';

/** The super admin: one real one, made or taking over the demo one. */
describe('super admin', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  describe('the password', () => {
    it('comes from SUPER_ADMIN_PASSWORD, within the length rules', async () => {
      process.env.SUPER_ADMIN_PASSWORD = 'correct horse battery';
      await expect(readPassword()).resolves.toBe('correct horse battery');
      process.env.SUPER_ADMIN_PASSWORD = 'short';
      await expect(readPassword()).rejects.toThrow('Password must be');
    });

    describe('typed in a terminal', () => {
      const stdin = process.stdin as unknown as Record<string, unknown>;
      const saved: Record<string, unknown> = {};
      let typed: string[] = [];
      beforeEach(() => {
        delete process.env.SUPER_ADMIN_PASSWORD;
        for (const k of [
          'isTTY',
          'setRawMode',
          'setEncoding',
          'resume',
          'pause',
        ])
          saved[k] = stdin[k];
        Object.defineProperty(process.stdin, 'isTTY', {
          value: true,
          configurable: true,
        });
        stdin.setRawMode = jest.fn();
        stdin.setEncoding = jest.fn();
        stdin.pause = jest.fn();
        // Each prompt's answer arrives as keys once reading starts.
        stdin.resume = jest.fn(() => {
          const keys = typed.shift();
          if (keys !== undefined)
            setImmediate(() => process.stdin.emit('data', keys));
        });
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      });
      afterEach(() => {
        Object.defineProperty(process.stdin, 'isTTY', {
          value: saved.isTTY,
          configurable: true,
        });
        for (const k of ['setRawMode', 'setEncoding', 'resume', 'pause'])
          stdin[k] = saved[k];
        jest.restoreAllMocks();
      });

      it('reads it twice without echo, with backspace', async () => {
        typed = ['correct horse batteryX\u007f\r', 'correct horse battery\n'];
        await expect(readPassword()).resolves.toBe('correct horse battery');
        expect(stdin.setRawMode).toHaveBeenCalledWith(true);
        expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
      });

      it('refuses two different passwords', async () => {
        typed = ['correct horse battery\r', 'something else entirely\r'];
        await expect(readPassword()).rejects.toThrow('Passwords do not match');
      });

      it('stops on Ctrl+C', async () => {
        const exit = jest
          .spyOn(process, 'exit')
          .mockImplementation((() => undefined) as never);
        typed = ['abc\u0003'];
        void readPassword();
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));
        expect(exit).toHaveBeenCalledWith(130);
        process.stdin.removeAllListeners('data');
      });
    });

    it('is typed in a terminal when not given', async () => {
      delete process.env.SUPER_ADMIN_PASSWORD;
      const tty = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        configurable: true,
      });
      await expect(readPassword()).rejects.toThrow(
        'Run in a terminal, or set SUPER_ADMIN_PASSWORD',
      );
      Object.defineProperty(process.stdin, 'isTTY', {
        value: tty,
        configurable: true,
      });
    });
  });

  describe('ensureSuperAdmin', () => {
    const build = (existing: object | null) => {
      const m = fakeRepo({
        findOne: jest.fn(() => Promise.resolve(existing)),
        save: jest.fn((u: object) => Promise.resolve({ ...u, id: 'new-id' })),
      });
      const app = {
        get: (token: unknown) =>
          token === DataSource
            ? { transaction: (work: (m: unknown) => unknown) => work(m) }
            : token === PasswordHasher
              ? { hash: () => Promise.resolve('hash') }
              : token === PersonalDetailsCodec
                ? { phoneIndex: () => 'idx', sealOperator: () => ({}) }
                : token === ConfigService ||
                    (token as { name?: string }).name === 'ConfigService'
                  ? {
                      get: () =>
                        'test test test test test test test test test test test junk',
                    }
                  : undefined,
      };
      return { app, m };
    };
    const input = {
      fullName: 'Tania Rahman',
      phone: '01711000000',
      password: 'correct horse battery',
    };

    it('creates the super admin on key 0', async () => {
      const { app, m } = build(null);
      const res = await ensureSuperAdmin(app as never, input);
      expect(res).toEqual({
        id: 'new-id',
        account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      });
      expect(m.insert).toHaveBeenCalledTimes(1);
    });

    it('takes over a demo super admin, ending its sessions', async () => {
      const { app, m } = build({ id: 'demo', isDemo: true });
      await expect(
        ensureSuperAdmin(app as never, input),
      ).resolves.toMatchObject({
        id: 'demo',
      });
      expect(m.increment).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'demo' },
        'tokenVersion',
        1,
      );
    });

    it('refuses when a real one exists', async () => {
      const { app } = build({ id: 'real', isDemo: false });
      await expect(ensureSuperAdmin(app as never, input)).rejects.toThrow(
        'A super admin already exists',
      );
    });
  });
});
