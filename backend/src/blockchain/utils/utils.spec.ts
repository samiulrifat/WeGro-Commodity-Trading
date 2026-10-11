import { keccak256, toUtf8Bytes } from 'ethers';
import { canonicalJson, fingerprint } from './fingerprint';
import {
  bytes32ToCode,
  bytes32ToUuid,
  codeToBytes32,
  isBytes32,
  uuidToBytes32,
} from './ids';
import { poishaToTaka, takaToPoisha } from './money';
import { hashPaymentRef, normalisePaymentRef } from './payment-ref';

describe('ids', () => {
  const uuid = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

  it('round-trips a uuid through bytes32', () => {
    const b = uuidToBytes32(uuid);
    expect(b).toBe(`0x${'0'.repeat(32)}3f2a9c1e5b7d4e8a9c217d4e5f6a8b90`);
    expect(isBytes32(b)).toBe(true);
    expect(bytes32ToUuid(b)).toBe(uuid);
    expect(bytes32ToUuid(uuidToBytes32(uuid.toUpperCase()))).toBe(uuid);
  });

  it('rejects malformed ids', () => {
    expect(() => uuidToBytes32('not-a-uuid')).toThrow();
    expect(() => bytes32ToUuid(`0x${'1'.repeat(64)}`)).toThrow(); // not left-padded
    expect(() => bytes32ToUuid('0x1234')).toThrow();
  });

  it('round-trips readable codes', () => {
    expect(bytes32ToCode(codeToBytes32('MAIZE'))).toBe('MAIZE');
    expect(bytes32ToCode(codeToBytes32('GROWTH_CHECK'))).toBe('GROWTH_CHECK');
    expect(() => codeToBytes32('maize')).toThrow();
    expect(() => codeToBytes32('A'.repeat(32))).toThrow();
    expect(() => codeToBytes32('')).toThrow();
  });
});

describe('money', () => {
  it('converts taka to poisha exactly', () => {
    expect(takaToPoisha('1.25')).toBe(125n);
    expect(takaToPoisha('20000')).toBe(2_000_000n);
    expect(takaToPoisha('0.1')).toBe(10n);
    expect(takaToPoisha('0')).toBe(0n);
    expect(takaToPoisha(' 6400.5 ')).toBe(640_050n);
    // Far beyond Number.MAX_SAFE_INTEGER: still exact.
    expect(takaToPoisha('90071992547409931.99')).toBe(9007199254740993199n);
  });

  it('rejects anything ambiguous', () => {
    for (const bad of ['1.234', '-5', '1,000', '01', '.5', '5.', 'abc', '']) {
      expect(() => takaToPoisha(bad)).toThrow();
    }
  });

  it('converts poisha back to a two-decimal string', () => {
    expect(poishaToTaka(125n)).toBe('1.25');
    expect(poishaToTaka(2_000_000n)).toBe('20000.00');
    expect(poishaToTaka(5n)).toBe('0.05');
    expect(() => poishaToTaka(-1n)).toThrow();
  });
});

describe('fingerprint', () => {
  it('ignores key order and whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, 'x'] } })).toBe(
      '{"a":{"c":[3,"x"],"d":2},"b":1}',
    );
    expect(
      fingerprint('participant', { name: 'Rahim', district: 'Bogura' }),
    ).toBe(fingerprint('participant', { district: 'Bogura', name: 'Rahim' }));
  });

  it('normalises bigints, dates and omitted fields', () => {
    expect(
      canonicalJson({
        amount: 12345678901234567890n,
        at: new Date('2026-10-11T00:00:00Z'),
        skip: undefined,
      }),
    ).toBe('{"amount":"12345678901234567890","at":"2026-10-11T00:00:00.000Z"}');
  });

  it('separates domains and detects any change', () => {
    const record = { notes: 'healthy', heightCm: 42 };
    expect(fingerprint('field-record', record)).not.toBe(
      fingerprint('participant', record),
    );
    expect(fingerprint('field-record', record)).not.toBe(
      fingerprint('field-record', { ...record, heightCm: 43 }),
    );
    expect(fingerprint('field-record', record)).toBe(
      keccak256(toUtf8Bytes(`wegro:field-record:${canonicalJson(record)}`)),
    );
  });

  it('rejects values it cannot represent exactly', () => {
    expect(() => canonicalJson({ x: NaN })).toThrow(/\$\.x/);
    expect(() => canonicalJson([1, undefined])).toThrow(/\$\[1\]/);
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
    expect(() => canonicalJson({ d: new Date('nope') })).toThrow();
    expect(() => fingerprint('Bad Domain', {})).toThrow();
  });
});

describe('payment references', () => {
  const secret = 's'.repeat(64);

  it('treats differently typed copies of a reference as the same', () => {
    expect(normalisePaymentRef('  txn-48213 ')).toBe('TXN-48213');
    expect(hashPaymentRef('txn-48213', secret)).toBe(
      hashPaymentRef(' TXN-48213', secret),
    );
    expect(isBytes32(hashPaymentRef('TXN-1', secret))).toBe(true);
  });

  it('depends on the secret and the reference', () => {
    expect(hashPaymentRef('TXN-1', secret)).not.toBe(
      hashPaymentRef('TXN-1', 't'.repeat(64)),
    );
    expect(hashPaymentRef('TXN-1', secret)).not.toBe(
      hashPaymentRef('TXN-2', secret),
    );
  });

  it('rejects empty or huge references', () => {
    expect(() => hashPaymentRef('   ', secret)).toThrow();
    expect(() => hashPaymentRef('x'.repeat(129), secret)).toThrow();
  });
});
