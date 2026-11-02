import { describe, expect, it } from 'vitest';
import { onlyChecked } from './search';

describe('onlyChecked', () => {
  it('clears every key of the address the check leaves out', () => {
    const check = onlyChecked((raw) =>
      raw.status === 'open' ? { status: 'open' as const } : {},
    );
    expect(check({ status: 'open', utm: 'x' })).toEqual({
      status: 'open',
      utm: undefined,
    });
    expect(check({ status: 'lost' })).toEqual({ status: undefined });
    expect(check({})).toEqual({});
  });
});
