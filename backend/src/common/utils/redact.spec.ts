import { isSensitiveKey, redact } from './redact';

describe('redact', () => {
  it('hides sensitive fields at any depth', () => {
    const out = redact({
      name: 'Rahim',
      password: 'hunter2',
      profile: { phoneNumber: '017...', district: 'Bogura' },
      payments: [{ paymentRef: 'TXN-1', amount: 100 }],
      headers: { Authorization: 'Bearer abc' },
    });
    expect(out).toEqual({
      name: 'Rahim',
      password: '[REDACTED]',
      profile: { phoneNumber: '[REDACTED]', district: 'Bogura' },
      payments: [{ paymentRef: '[REDACTED]', amount: 100 }],
      headers: { Authorization: '[REDACTED]' },
    });
  });

  it('matches keys regardless of case and separators', () => {
    expect(isSensitiveKey('KEY_MASTER_MNEMONIC')).toBe(true);
    expect(isSensitiveKey('private_key')).toBe(true);
    expect(isSensitiveKey('jwtToken')).toBe(true);
    expect(isSensitiveKey('district')).toBe(false);
  });

  it('leaves plain values and dates alone and stops at deep nesting', () => {
    const when = new Date('2026-10-08');
    expect(redact('text')).toBe('text');
    expect(redact({ at: when })).toEqual({ at: when });
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 10; i++) deep = { next: deep };
    expect(JSON.stringify(redact(deep))).toContain('[TRUNCATED]');
  });
});
