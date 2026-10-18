import { describe, expect, it } from 'vitest';
import { newPasswordProblem, PASSWORD_MAX } from './password-rules';

describe('a new password', () => {
  it('needs 10 to 128 characters, typed the same twice', () => {
    expect(newPasswordProblem({ value: 'short', again: 'short' })).toBe(
      'tooShort',
    );
    const long = 'x'.repeat(PASSWORD_MAX + 1);
    expect(newPasswordProblem({ value: long, again: long })).toBe('tooLong');
    expect(
      newPasswordProblem({ value: 'long-enough-1', again: 'long-enough-2' }),
    ).toBe('mismatch');
    expect(
      newPasswordProblem({ value: 'long-enough-1', again: 'long-enough-1' }),
    ).toBe(null);
  });
});
