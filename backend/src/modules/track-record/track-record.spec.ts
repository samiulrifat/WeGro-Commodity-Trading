import { addMonths } from '../../common/time/bd-dates';
import {
  bankFingerprint,
  consentFingerprint,
} from './track-record-fingerprints';
import {
  percent,
  summaryFingerprint,
  type TrackRecordSummary,
} from './track-record-summary';

const FARMER = '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d';
const BANK = '11111111-2222-4333-8444-555555555555';

describe('track record maths', () => {
  it('adds calendar months, keeping to the end of shorter months', () => {
    expect(addMonths('2026-01-15', 5)).toBe('2026-06-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-10-13', 12)).toBe('2027-10-13');
  });

  it('gives returns as a percentage with two decimals, rounded toward zero', () => {
    expect(percent(880_228n, 4_000_000n)).toBe('22.00');
    expect(percent(1n, 3n)).toBe('33.33');
    expect(percent(-1n, 3n)).toBe('-33.33');
    expect(percent(-150_000n, 7_000_000n)).toBe('-2.14');
    expect(percent(0n, 7_000_000n)).toBe('0.00');
  });
});

describe('track record fingerprints', () => {
  const summary: TrackRecordSummary = {
    v: 1,
    recordId: BANK,
    generatedAt: '2027-03-22T06:27:02.000Z',
    farmer: {
      id: FARMER,
      name: 'রহিম উদ্দিন',
      district: { code: 'BOGURA', name: 'Bogura' },
    },
    projects: [],
    totals: {
      projects: 0,
      finishedOnTime: 0,
      fundingRaised: '0.00',
      income: '0.00',
      costs: '0.00',
      net: '0.00',
      farmerReceived: '0.00',
      claimsApproved: 0,
      claimsApprovedAmount: '0.00',
    },
  };

  it('fingerprints the summary the same after a database round trip', () => {
    // jsonb keeps neither key order nor whitespace.
    const reordered = JSON.parse(
      JSON.stringify(summary, Object.keys(summary).reverse()),
    ) as TrackRecordSummary;
    const roundTrip = { ...reordered, ...JSON.parse(JSON.stringify(summary)) };
    expect(summaryFingerprint(roundTrip)).toBe(summaryFingerprint(summary));
    expect(
      summaryFingerprint({
        ...summary,
        totals: { ...summary.totals, net: '0.01' },
      }),
    ).not.toBe(summaryFingerprint(summary));
  });

  it('binds the signed form to the farmer, bank and expiry', () => {
    const grant = {
      consentId: BANK,
      farmerId: FARMER,
      bankId: BANK,
      expiresAt: 1_800_000_000,
      photoHash: `0x${'ab'.repeat(32)}`,
    };
    const h = consentFingerprint(grant);
    for (const change of [
      { expiresAt: 1_800_000_001 },
      { bankId: FARMER },
      { photoHash: `0x${'cd'.repeat(32)}` },
    ]) {
      expect(consentFingerprint({ ...grant, ...change })).not.toBe(h);
    }
    const bank = bankFingerprint({
      id: BANK,
      name: 'BRAC Bank PLC',
      branchName: 'Bogura',
      districtCode: 'BOGURA',
      address: 'Satmatha',
    });
    expect(new Set([h, bank, summaryFingerprint(summary)]).size).toBe(3);
  });
});
