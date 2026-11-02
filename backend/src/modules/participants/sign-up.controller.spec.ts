import { ChainState } from '../../../test/support/unit';
import { SignUpController } from './sign-up.controller';

/** A sign-up the ledger has not confirmed yet is kept, and the person told to wait. */
describe('SignUpController', () => {
  it('says the account is created but still being confirmed, without signing in', async () => {
    const tokens = { issue: jest.fn() };
    const controller = new SignUpController(
      {
        signUp: () => Promise.resolve({ chainState: ChainState.SUBMITTED }),
      } as never,
      tokens as never,
      {} as never,
    );
    await expect(
      controller.create({} as never, {} as never),
    ).rejects.toMatchObject({
      response: {
        code: 'REGISTRATION_CONFIRMING',
        details: { created: true },
      },
    });
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
