import {
  bdDate,
  bdDayEnd,
  bdDayStart,
  bdLastDay,
  isPastDay,
} from '../../common/time/bd-dates';
import {
  intakeFingerprint,
  recheckFingerprint,
  siteFingerprint,
} from './warehouse.service';

describe('Bangladesh calendar days', () => {
  it('maps a last valid day to the ledger instant and back', () => {
    for (const day of [
      '2026-10-12',
      '2027-02-28',
      '2028-02-29',
      '2026-12-31',
    ]) {
      expect(bdLastDay(bdDayEnd(day))).toBe(day);
      expect(bdDayEnd(day) - bdDayStart(day)).toBe(86_400);
    }
  });

  it('is valid through the whole last day, by the given clock', () => {
    const end = bdDayEnd('2026-10-12') * 1000;
    expect(isPastDay('2026-10-12', new Date(end - 1000))).toBe(false);
    expect(isPastDay('2026-10-12', new Date(end))).toBe(true);
    expect(bdDate(new Date(end - 1000))).toBe('2026-10-12');
    expect(bdDate(new Date(end))).toBe('2026-10-13');
  });
});

describe('warehouse fingerprints', () => {
  const intake = {
    id: `0x${'ab'.repeat(32)}`,
    projectId: '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d',
    siteId: '11111111-2222-4333-8444-555555555555',
    produceCode: 'MAIZE',
    originalQuantity: 5000,
    bagCount: 100,
    moisturePercent: '13.5',
    storageBay: 'Bay C-4',
    intakeDate: '2026-10-12',
    notes: null,
  };

  it('binds the intake record to the receipt and changes with any detail', () => {
    const h = intakeFingerprint(intake);
    expect(intakeFingerprint({ ...intake })).toBe(h);
    for (const change of [
      { originalQuantity: 5001 },
      { moisturePercent: '13.6' },
      { bagCount: null },
      { siteId: '11111111-2222-4333-8444-555555555556' },
      { id: `0x${'cd'.repeat(32)}` },
    ]) {
      expect(intakeFingerprint({ ...intake, ...change })).not.toBe(h);
    }
  });

  it('keeps sites, intakes and re-checks in separate domains', () => {
    const recheck = recheckFingerprint({
      receiptId: intake.id,
      checkedOn: '2027-01-01',
      newExpiresOn: '2027-06-30',
      bagCount: 100,
      moisturePercent: '13.5',
      storageBay: 'Bay C-4',
      notes: null,
    });
    const site = siteFingerprint({
      id: intake.siteId,
      name: 'Bogura Central',
      districtCode: 'BOGURA',
      address: 'Shibganj road',
      storageType: 'warehouse' as never,
      capacityKg: null,
    });
    expect(new Set([recheck, site, intakeFingerprint(intake)]).size).toBe(3);
  });
});
