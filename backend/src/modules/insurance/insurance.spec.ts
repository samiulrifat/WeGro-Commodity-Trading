import { Severity } from './insurance.enums';
import {
  assessmentFingerprint,
  claimFingerprint,
  coverageFingerprint,
  normalisePercent,
  weatherEventFingerprint,
} from './insurance-fingerprints';

const PROJECT = '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d';
const INSURER = '11111111-2222-4333-8444-555555555555';
const EVENT = '22222222-3333-4444-8555-666666666666';
const CLAIM = '33333333-4444-4555-8666-777777777777';

describe('insurance fingerprints', () => {
  const terms = {
    projectId: PROJECT,
    insurerId: INSURER,
    maxAmount: 30_000_000n,
    coveredEventTypes: ['CYCLONE', 'FLOOD'],
    notes: null,
    previousTermsHash: null,
  };

  it('changes the cover fingerprint with any term, and chains versions', () => {
    const first = coverageFingerprint(terms);
    expect(coverageFingerprint({ ...terms })).toBe(first);
    for (const change of [
      { maxAmount: 30_000_001n },
      { coveredEventTypes: ['FLOOD'] },
      { notes: 'Excludes hail' },
      { insurerId: EVENT },
    ]) {
      expect(coverageFingerprint({ ...terms, ...change })).not.toBe(first);
    }
    // The same terms set again after a change are a new version, not the old one.
    expect(
      coverageFingerprint({ ...terms, previousTermsHash: first }),
    ).not.toBe(first);
  });

  const claim = {
    claimId: CLAIM,
    projectId: PROJECT,
    eventId: EVENT,
    damagePercent: '40.5',
    notes: 'Half the field under water for four days',
    photoHashes: [`0x${'aa'.repeat(32)}`, `0x${'bb'.repeat(32)}`],
  };

  it("binds the officer's evidence, photos in order", () => {
    const h = claimFingerprint(claim);
    expect(claimFingerprint({ ...claim })).toBe(h);
    for (const change of [
      { damagePercent: '40.6' },
      { photoHashes: [...claim.photoHashes].reverse() },
      { photoHashes: claim.photoHashes.slice(1) },
      { eventId: INSURER },
    ]) {
      expect(claimFingerprint({ ...claim, ...change })).not.toBe(h);
    }
  });

  it('binds the decision and amount to the assessment', () => {
    const approved = {
      claimId: CLAIM,
      decision: 'approved' as const,
      approvedAmount: 12_000_000n,
      damagePercent: '35.0',
      notes: 'Confirmed on site',
      photoHash: null,
    };
    const h = assessmentFingerprint(approved);
    expect(
      assessmentFingerprint({ ...approved, approvedAmount: 12_000_001n }),
    ).not.toBe(h);
    expect(
      assessmentFingerprint({
        ...approved,
        decision: 'rejected',
        approvedAmount: null,
      }),
    ).not.toBe(h);
  });

  it('keeps cover, events, claims and assessments in separate domains', () => {
    const event = weatherEventFingerprint({
      id: EVENT,
      districtCode: 'BOGURA',
      eventTypeCode: 'FLOOD',
      occurredOn: '2026-07-14',
      severity: Severity.SEVERE,
      notes: null,
    });
    const assessment = assessmentFingerprint({
      claimId: CLAIM,
      decision: 'rejected',
      approvedAmount: null,
      damagePercent: null,
      notes: 'x',
      photoHash: null,
    });
    expect(
      new Set([
        coverageFingerprint(terms),
        event,
        claimFingerprint(claim),
        assessment,
      ]).size,
    ).toBe(4);
  });
});

describe('normalisePercent', () => {
  it('always gives one decimal place, as the database stores it', () => {
    expect(normalisePercent('40.5')).toBe('40.5');
    expect(normalisePercent('40')).toBe('40.0');
    expect(normalisePercent(7)).toBe('7.0');
    expect(normalisePercent('100')).toBe('100.0');
    expect(normalisePercent('0.1')).toBe('0.1');
  });
});
