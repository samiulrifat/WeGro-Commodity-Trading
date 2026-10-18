import { DurationType } from './project.enums';
import {
  applyBps,
  bpsToPercent,
  checkTerms,
  type ProjectTerms,
  termsHash,
  totalSlots,
} from './project-terms';

const ID = '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d';

const terms = (over: Partial<ProjectTerms> = {}): ProjectTerms => ({
  title: 'Bogura maize',
  description: null,
  produceCode: 'MAIZE',
  category: 'storable_crop',
  districtCode: 'BOGURA',
  location: 'Shibganj',
  farmerId: '11111111-2222-4333-8444-555555555555',
  durationType: DurationType.LONG_TERM,
  durationMonths: 8,
  payoutIntervalMonths: 4,
  fundingTarget: 2_000_000_00n,
  slotPrice: 20_000_00n,
  farmerBps: 4000,
  investorBps: 4000,
  wegroBps: 2000,
  insured: true,
  estimatedReturnMinBps: 800,
  estimatedReturnMaxBps: 1500,
  plannedStartDate: '2026-11-15',
  ...over,
});

describe('checkTerms', () => {
  it('accepts the PRD example: 100 slots of Tk 20,000, 40-40-20, long term', () => {
    expect(checkTerms(terms())).toEqual([]);
    expect(totalSlots(terms())).toBe(100);
  });

  it('needs a whole number of slots, at most 10,000', () => {
    expect(checkTerms(terms({ fundingTarget: 2_000_050_00n }))).toEqual([
      {
        code: 'TERMS_PARTIAL_SLOT',
        message: 'Funding target must be a whole number of slots',
      },
    ]);
    expect(checkTerms(terms({ slotPrice: 0n }))).toHaveLength(1);
    expect(
      checkTerms(terms({ fundingTarget: 10_001n, slotPrice: 1n })),
    ).toEqual([
      {
        code: 'TERMS_TOO_MANY_SLOTS',
        message: 'A project can have at most 10000 slots',
        details: { max: 10_000 },
      },
    ]);
    expect(
      checkTerms(terms({ fundingTarget: 10_000n, slotPrice: 1n })),
    ).toEqual([]);
  });

  it('needs shares that add up to exactly 100%', () => {
    expect(checkTerms(terms({ wegroBps: 1999 }))).toHaveLength(1);
    expect(checkTerms(terms({ farmerBps: 5000, investorBps: 3000 }))).toEqual(
      [],
    );
  });

  it('applies the short- and long-term duration rules', () => {
    const short = (over: Partial<ProjectTerms>) =>
      checkTerms(
        terms({
          durationType: DurationType.SHORT_TERM,
          payoutIntervalMonths: 0,
          ...over,
        }),
      );
    expect(short({ durationMonths: 6 })).toEqual([]);
    expect(short({ durationMonths: 7 })).toHaveLength(1);
    expect(short({ durationMonths: 4, payoutIntervalMonths: 2 })).toHaveLength(
      1,
    );
    expect(checkTerms(terms({ durationMonths: 6 }))).toHaveLength(1);
    expect(checkTerms(terms({ payoutIntervalMonths: 9 }))).toHaveLength(1);
    expect(checkTerms(terms({ payoutIntervalMonths: 0 }))).toEqual([]);
    expect(checkTerms(terms({ durationMonths: 0 }))).toHaveLength(1);
  });

  it('rejects an inverted estimate and reports every problem at once', () => {
    const problems = checkTerms(
      terms({ estimatedReturnMinBps: 2000, wegroBps: 0, slotPrice: 3n }),
    );
    expect(problems).toHaveLength(3);
  });
});

describe('termsHash', () => {
  it('is stable, and changes with any term or the project id', () => {
    const h = termsHash(ID, terms());
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(termsHash(ID, terms())).toBe(h);
    expect(termsHash(ID, terms({ slotPrice: 20_000_01n }))).not.toBe(h);
    expect(termsHash(ID, terms({ insured: false }))).not.toBe(h);
    expect(termsHash(ID.replace('7d3f', '7d40'), terms())).not.toBe(h);
  });
});

describe('basis points', () => {
  it('formats percentages exactly', () => {
    expect(bpsToPercent(4000)).toBe('40.00');
    expect(bpsToPercent(1250)).toBe('12.50');
    expect(bpsToPercent(5)).toBe('0.05');
    expect(bpsToPercent(0)).toBe('0.00');
  });

  it('takes shares of poisha amounts, rounding down', () => {
    expect(applyBps(20_000_00n, 800)).toBe(1_600_00n);
    expect(applyBps(333n, 3333)).toBe(110n);
    expect(applyBps(1n, 9999)).toBe(0n);
  });
});
