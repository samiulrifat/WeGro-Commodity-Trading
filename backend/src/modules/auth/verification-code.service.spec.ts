import { Logger } from '@nestjs/common';
import { fakeRepo } from '../../../test/support/unit';
import { CodePurpose } from './entities/verification-code.entity';
import { VerificationCodeService } from './verification-code.service';

/**
 * Sending is not awaited, so the answer takes as long whether or not a code
 * goes out; a failed send is logged, never shown. Limits and checks run
 * against Postgres in the chain suite.
 */
describe('VerificationCodeService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('answers at once and logs a code that could not be sent', async () => {
    const errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const manager = fakeRepo();
    const codes = {
      manager: {
        transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
      },
    };
    const sms = {
      send: jest.fn(() => Promise.reject(new Error('gateway down'))),
    };
    const service = new VerificationCodeService(
      codes as never,
      { phoneIndex: () => 'index', emailIndex: () => 'index' } as never,
      { blindIndex: () => 'hash' } as never,
      sms as never,
      { send: jest.fn() } as never,
    );
    await expect(
      service.issue(CodePurpose.PASSWORD_RESET, '01711234567', {
        userId: 'u1',
        language: null,
      }),
    ).resolves.toMatchObject({ resendAfterSeconds: 60 });
    await new Promise((r) => setImmediate(r));
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith('Code not sent: Error: gateway down');
  });
});
