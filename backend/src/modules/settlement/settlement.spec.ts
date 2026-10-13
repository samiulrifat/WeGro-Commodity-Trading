import { randomInt } from 'node:crypto';
import { toCsv } from '../../common/csv';
import {
  costFingerprint,
  lineHash,
  rejectFingerprint,
  roundTotals,
  signedTaka,
  splitRound,
} from './settlement-math';
import { PayeeRole } from './settlement.enums';

const FARMER = '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d';
const A = '11111111-2222-4333-8444-555555555555';
const B = '22222222-3333-4444-8555-666666666666';
const terms = {
  farmerBps: 4000,
  investorBps: 4000,
  wegroBps: 2000,
  issuedSlots: 7,
  slotPrice: 1_000_000n,
};

describe('settlement maths', () => {
  it('splits profit by percentages and investors by slots, rounding down', () => {
    const totals = roundTotals({
      income: 4_001_000n,
      costs: 150_000n,
      alreadySplit: 0n,
      isFinal: false,
      terms,
    });
    expect(totals).toMatchObject({ profit: 3_851_000n, capitalReturn: 0n });
    const { figures, lines } = splitRound(totals, terms, FARMER, [
      { investorId: A, slots: 4 },
      { investorId: B, slots: 3 },
    ]);
    expect(figures).toMatchObject({
      farmerShare: 1_540_400n,
      investorShare: 1_540_400n,
      wegroShare: 770_200n,
    });
    expect(lines).toEqual([
      {
        payeeId: FARMER,
        role: PayeeRole.Farmer,
        slots: null,
        amount: 1_540_400n,
      },
      // 1_540_400 * 4 / 7 = 880_228.57… and * 3 / 7 = 660_171.42…
      { payeeId: A, role: PayeeRole.Investor, slots: 4, amount: 880_228n },
      { payeeId: B, role: PayeeRole.Investor, slots: 3, amount: 660_171n },
    ]);
    expect(figures.leftover).toBe(1n);
  });

  it('never creates or loses a poisha, whatever the figures', () => {
    for (let i = 0; i < 500; i++) {
      const farmerBps = randomInt(0, 10_001);
      const investorBps = randomInt(0, 10_001 - farmerBps);
      const t = {
        farmerBps,
        investorBps,
        wegroBps: 10_000 - farmerBps - investorBps,
        issuedSlots: randomInt(1, 200),
        slotPrice: BigInt(randomInt(1, 10_000_000)),
      };
      const holdings: { investorId: string; slots: number }[] = [];
      let left = t.issuedSlots;
      for (let n = 0; left > 0; n++) {
        const slots = randomInt(1, left + 1);
        holdings.push({ investorId: `investor-${n}`, slots });
        left -= slots;
      }
      const totals = roundTotals({
        income: BigInt(randomInt(0, 2 ** 40)),
        costs: BigInt(randomInt(0, 2 ** 40)),
        alreadySplit: BigInt(randomInt(0, 2 ** 30)),
        isFinal: i % 2 === 0,
        terms: t,
      });
      const { figures, lines } = splitRound(totals, t, FARMER, holdings);
      const paid = lines.reduce((sum, l) => sum + l.amount, 0n);
      expect(paid + figures.wegroShare + figures.leftover).toBe(
        figures.profit + figures.capitalReturn,
      );
      expect(lines.every((l) => l.amount > 0n)).toBe(true);
    }
  });

  it('takes an overall loss out of the capital returned, never below zero', () => {
    const base = { alreadySplit: 0n, isFinal: true, terms };
    expect(
      roundTotals({ ...base, income: 500_000n, costs: 800_000n }),
    ).toMatchObject({ profit: 0n, capitalReturn: 6_700_000n });
    expect(
      roundTotals({ ...base, income: 0n, costs: 9_000_000n }),
    ).toMatchObject({ profit: 0n, capitalReturn: 0n });
    // Profit already paid out in staged rounds counts against the final one.
    expect(
      roundTotals({
        ...base,
        income: 1_000_000n,
        costs: 0n,
        alreadySplit: 1_200_000n,
      }),
    ).toMatchObject({ profit: 0n, capitalReturn: 6_800_000n });
  });

  it('hashes lines and fingerprints details deterministically', () => {
    const payee = `0x${'ab'.repeat(32)}`;
    expect(lineHash(3, payee, 100n)).toBe(lineHash(3, payee, 100n));
    expect(lineHash(3, payee, 100n)).not.toBe(lineHash(3, payee, 101n));
    expect(lineHash(3, payee, 100n)).not.toBe(lineHash(4, payee, 100n));
    const cost = {
      id: A,
      projectId: FARMER,
      category: 'transport',
      amount: 150_000n,
      incurredOn: '2026-10-10',
      note: 'Truck hire',
      photoHash: null,
    };
    expect(costFingerprint({ ...cost, id: B })).not.toBe(costFingerprint(cost));
    expect(rejectFingerprint(1, 'x')).not.toBe(rejectFingerprint(2, 'x'));
  });

  it('shows a loss with a sign', () => {
    expect(signedTaka(-50_050n)).toBe('-500.50');
    expect(signedTaka(50_050n)).toBe('500.50');
  });
});

describe('CSV', () => {
  it('quotes, keeps Bangla, and stops spreadsheet formulas', () => {
    const csv = toCsv(
      ['name', 'note', 'amount'],
      [
        ['রহিমা বেগম', 'says "hi", ok', '-500.50'],
        ['=HYPERLINK("x")', '+cmd', '@sum'],
        [null, true, new Date('2026-10-13T00:00:00Z')],
        ['+8801700000007', '-cmd', 0],
      ],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')).toEqual([
      '\uFEFFname,note,amount',
      'রহিমা বেগম,"says ""hi"", ok",-500.50',
      `"'=HYPERLINK(""x"")",'+cmd,'@sum`,
      ',yes,2026-10-13T00:00:00.000Z',
      "+8801700000007,'-cmd,0",
      '',
    ]);
  });
});
