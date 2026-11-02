import { QueryFailedError } from 'typeorm';
import { actor, fakeRepo, Role } from '../../../test/support/unit';
import { MyEmailService } from './my-email.service';

/** Two people confirming one address at once: the second is told it is taken. */
describe('MyEmailService', () => {
  const build = (saveError: Error) => {
    const manager = fakeRepo({
      update: jest.fn(() => Promise.reject(saveError)),
    });
    const users = fakeRepo({
      exists: jest.fn(() => Promise.resolve(false)),
      manager: {
        transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
      },
    });
    const codes = {
      check: jest.fn(() => Promise.resolve({ ok: true, row: { id: 'c1' } })),
      close: jest.fn(() => Promise.resolve()),
    };
    return new MyEmailService(
      users as never,
      { emailIndex: () => 'index' } as never,
      codes as never,
    );
  };
  const me = actor(Role.INVESTOR);

  it('says the address is taken when someone confirmed it a moment earlier', async () => {
    const race = new QueryFailedError('UPDATE ...', [], {
      code: '23505',
    } as unknown as Error);
    await expect(
      build(race).confirm(me, 'rahim@example.com', '123456'),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_ALREADY_REGISTERED' } });
  });

  it('passes other failures on unchanged', async () => {
    await expect(
      build(new Error('disk full')).confirm(me, 'rahim@example.com', '123456'),
    ).rejects.toThrow('disk full');
  });
});
