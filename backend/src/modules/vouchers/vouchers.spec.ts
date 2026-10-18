import {
  bdDate,
  expiresAtSeconds,
  isExpired,
  producedAtSeconds,
} from './batch-dates';
import { batchFingerprint } from './batches.service';
import { VoucherStatus } from './voucher.enums';
import { inactiveSince } from './vouchers.service';

describe('batch dates (Bangladesh calendar days)', () => {
  it('starts a production day at midnight in Dhaka', () => {
    // 2026-09-01 00:00 +06:00 = 2026-08-31 18:00 UTC
    expect(producedAtSeconds('2026-09-01')).toBe(
      Date.UTC(2026, 7, 31, 18) / 1000,
    );
  });

  it('keeps a batch usable through its whole expiry day', () => {
    expect(expiresAtSeconds(null)).toBe(0);
    expect(expiresAtSeconds('2026-09-01')).toBe(
      Date.UTC(2026, 8, 1, 18) / 1000,
    );
    const lastMoment = new Date(Date.UTC(2026, 8, 1, 17, 59, 59));
    const nextDay = new Date(Date.UTC(2026, 8, 1, 18));
    expect(isExpired('2026-09-01', lastMoment)).toBe(false);
    expect(isExpired('2026-09-01', nextDay)).toBe(true);
    expect(isExpired(null, nextDay)).toBe(false);
  });

  it('gives the calendar day in Dhaka for an instant', () => {
    expect(bdDate(new Date(Date.UTC(2026, 9, 11, 17, 59)))).toBe('2026-10-11');
    expect(bdDate(new Date(Date.UTC(2026, 9, 11, 18, 0)))).toBe('2026-10-12');
  });

  it('produces an expiry after the production time, as the ledger requires', () => {
    expect(expiresAtSeconds('2026-09-01')).toBeGreaterThan(
      producedAtSeconds('2026-09-01'),
    );
  });
});

describe('inactiveSince', () => {
  const last = new Date('2026-10-01T00:00:00Z');
  const v = (over = {}) => ({
    status: VoucherStatus.ACTIVE,
    inactivityLimitDays: 10 as number | null,
    lastActivityAt: last as Date | null,
    ...over,
  });

  it('flags an active voucher once its limit has passed, by the given clock', () => {
    expect(inactiveSince(v(), new Date('2026-10-10T23:59:59Z'))).toBeNull();
    expect(inactiveSince(v(), new Date('2026-10-11T00:00:00Z'))).toEqual(
      new Date('2026-10-11T00:00:00Z'),
    );
  });

  it('never flags without a limit, or a voucher that is not active', () => {
    const late = new Date('2027-01-01Z');
    expect(inactiveSince(v({ inactivityLimitDays: null }), late)).toBeNull();
    expect(
      inactiveSince(v({ status: VoucherStatus.PROPOSED }), late),
    ).toBeNull();
    expect(
      inactiveSince(v({ status: VoucherStatus.CANCELLED }), late),
    ).toBeNull();
    expect(inactiveSince(v({ lastActivityAt: null }), late)).toBeNull();
  });
});

describe('batchFingerprint', () => {
  const batch = {
    id: '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d',
    supplierId: '11111111-2222-4333-8444-555555555555',
    inputTypeCode: 'UREA',
    lotNumber: 'KF-2026-0412',
    quantity: 2000,
    manufacturer: 'Karnaphuli Fertilizer',
    producedOn: '2026-09-01',
    expiresOn: '2028-08-31',
    notes: null,
  };

  it('is stable and covers every detail', () => {
    const h = batchFingerprint(batch);
    expect(batchFingerprint({ ...batch })).toBe(h);
    for (const change of [
      { lotNumber: 'KF-2026-0413' },
      { quantity: 2001 },
      { expiresOn: null },
      { supplierId: '11111111-2222-4333-8444-555555555556' },
      { notes: 'x' },
    ]) {
      expect(batchFingerprint({ ...batch, ...change })).not.toBe(h);
    }
  });
});
