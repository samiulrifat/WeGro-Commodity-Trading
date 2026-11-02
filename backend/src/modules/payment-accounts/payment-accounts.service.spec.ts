import {
  actor,
  fakeRepo,
  Role,
  uniqueViolation,
} from '../../../test/support/unit';
import { PaymentAccountsService } from './payment-accounts.service';

/** One account per branch and number; anything else the database says is passed on. */
describe('PaymentAccountsService', () => {
  const branch = {
    routingNumber: '200100405',
    name: 'BOGRA BAZAR',
    bank: { name: 'SONALI BANK LTD.' },
    district: { name: 'BOGRA' },
  };
  const create = (saveError: Error) =>
    new PaymentAccountsService(
      fakeRepo({ save: jest.fn(() => Promise.reject(saveError)) }) as never,
      { find: () => Promise.resolve(branch) } as never,
    ).create(actor(Role.ACCOUNTS), {
      routingNumber: '200100405',
      accountName: 'WEGRO TECHNOLOGIES LTD',
      accountNumber: '1042112000000463',
    } as never);

  it('refuses the same account twice', async () => {
    await expect(create(uniqueViolation())).rejects.toMatchObject({
      response: { code: 'PAYMENT_ACCOUNT_EXISTS' },
    });
  });

  it('passes any other failure on unchanged', async () => {
    await expect(create(new Error('disk full'))).rejects.toThrow('disk full');
  });
});
