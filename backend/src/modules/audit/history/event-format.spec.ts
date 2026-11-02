import { readableArgs } from './event-format';

describe('readableArgs', () => {
  it('reads each item of a list the way it reads one value', () => {
    expect(
      readableArgs('Marketplace', {
        amount: ['150000', '2500'],
        expiresAt: ['0', '1767225600'],
      }),
    ).toEqual({
      amount: ['1500.00', '25.00'],
      expiresAt: [null, '2026-01-01T00:00:00.000Z'],
    });
  });
});
