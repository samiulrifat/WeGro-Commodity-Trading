import { Logger } from '@nestjs/common';
import { LogEmailSender, MemoryEmailSender } from './email/email-sender';
import { LogSmsSender, MemorySmsSender } from './sms/sms-sender';

/** Local senders: the log never shows a whole number or address. */
describe('local senders', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs an SMS with the number masked', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await new LogSmsSender().send('01711234567', 'Your code is 123456');
    expect(log).toHaveBeenCalledWith('To 017112•••••567: Your code is 123456');
  });

  it('logs an email with the address masked', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await new LogEmailSender().send(
      'rahim@example.com',
      'WeGro: your code',
      '123456',
    );
    expect(log).toHaveBeenCalledWith(
      'To ra•••@example.com: WeGro: your code: 123456',
    );
  });

  it('keeps what it would send in memory, for tests', async () => {
    const sms = new MemorySmsSender();
    await sms.send('01711234567', 'Hello');
    expect(sms.outbox).toEqual([{ phone: '01711234567', text: 'Hello' }]);
    const email = new MemoryEmailSender();
    await email.send('a@b.co', 'Subject', 'Body');
    expect(email.outbox).toEqual([
      { to: 'a@b.co', subject: 'Subject', text: 'Body' },
    ]);
  });
});
