import { AbiCoder, keccak256 } from 'ethers';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import { poishaToTaka } from '../../blockchain/utils/money';
import { PayeeRole } from './settlement.enums';

/**
 * SettlementLedger's arithmetic, done again off the ledger: to preview a
 * round before preparing it, and to work out the per-payee amounts the
 * ledger keeps only as hashes. Every rule here mirrors the contract exactly,
 * integer division included; the fingerprints prove it each time.
 */

const BPS = 10_000n;
/** SettlementLedger.MONTH: payout intervals count 30-day months. */
export const MONTH_SECONDS = 30 * 86_400;

export interface SplitTerms {
  farmerBps: number;
  investorBps: number;
  wegroBps: number;
  issuedSlots: number;
  /** Poisha. */
  slotPrice: bigint;
}

/** Poisha, as SettlementLedger.Round holds them. */
export interface Figures {
  income: bigint;
  costs: bigint;
  profit: bigint;
  farmerShare: bigint;
  investorShare: bigint;
  wegroShare: bigint;
  capitalReturn: bigint;
  leftover: bigint;
}

export interface Holding {
  investorId: string;
  slots: number;
}

export interface Line {
  payeeId: string;
  role: PayeeRole;
  slots: number | null;
  amount: bigint;
}

/** The four figures the ledger emits when it prepares a round. */
export interface RoundTotals {
  income: bigint;
  costs: bigint;
  profit: bigint;
  capitalReturn: bigint;
}

/**
 * Mirrors `_computeFigures`: the profit not yet split, and for a final round
 * the capital returned to investors less any overall loss.
 */
export function roundTotals(input: {
  income: bigint;
  costs: bigint;
  alreadySplit: bigint;
  isFinal: boolean;
  terms: Pick<SplitTerms, 'issuedSlots' | 'slotPrice'>;
}): RoundTotals {
  const { income, costs, alreadySplit, terms } = input;
  const profit =
    income > costs + alreadySplit ? income - costs - alreadySplit : 0n;
  let capitalReturn = 0n;
  if (input.isFinal) {
    const capital = BigInt(terms.issuedSlots) * terms.slotPrice;
    const shortfall =
      costs + alreadySplit > income ? costs + alreadySplit - income : 0n;
    capitalReturn = capital > shortfall ? capital - shortfall : 0n;
  }
  return { income, costs, profit, capitalReturn };
}

/**
 * Mirrors the rest of `_computeFigures` and `_writeLines`: the profit is
 * divided by the project's percentages; the farmer gets their share and each
 * investor their part of the investors' share and of the capital by slots,
 * each rounded down. All rounding remainders are the leftover, kept by WeGro.
 */
export function splitRound(
  totals: RoundTotals,
  terms: SplitTerms,
  farmerId: string,
  holdings: Holding[],
): { figures: Figures; lines: Line[] } {
  const { profit } = totals;
  const f: Figures = {
    ...totals,
    farmerShare: (profit * BigInt(terms.farmerBps)) / BPS,
    investorShare: (profit * BigInt(terms.investorBps)) / BPS,
    wegroShare: (profit * BigInt(terms.wegroBps)) / BPS,
    leftover: 0n,
  };
  f.leftover = profit - f.farmerShare - f.investorShare - f.wegroShare;

  const lines: Line[] = [];
  if (f.farmerShare !== 0n) {
    lines.push({
      payeeId: farmerId,
      role: PayeeRole.FARMER,
      slots: null,
      amount: f.farmerShare,
    });
  }
  const pool = f.investorShare + f.capitalReturn;
  if (pool !== 0n && terms.issuedSlots > 0) {
    const issued = BigInt(terms.issuedSlots);
    let paidOut = 0n;
    for (const h of holdings) {
      const slots = BigInt(h.slots);
      const amount =
        (f.investorShare * slots) / issued + (f.capitalReturn * slots) / issued;
      if (amount === 0n) continue;
      paidOut += amount;
      lines.push({
        payeeId: h.investorId,
        role: PayeeRole.INVESTOR,
        slots: h.slots,
        amount,
      });
    }
    f.leftover += pool - paidOut;
  }
  return { figures: f, lines };
}

const abi = AbiCoder.defaultAbiCoder();

/** SettlementLedger's round fingerprint: keccak256(abi.encode(roundId, projectId, figures...)). */
export function roundFingerprint(
  roundId: number,
  projectIdBytes32: string,
  f: Figures,
): string {
  return keccak256(
    abi.encode(
      [
        'uint256',
        'bytes32',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
      ],
      [
        roundId,
        projectIdBytes32,
        f.income,
        f.costs,
        f.profit,
        f.farmerShare,
        f.investorShare,
        f.wegroShare,
        f.capitalReturn,
        f.leftover,
      ],
    ),
  );
}

/** SettlementLedger.lineHash: lets a payee or auditor check their own amount. */
export function lineHash(
  roundId: number,
  payeeIdBytes32: string,
  amount: bigint,
): string {
  return keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'uint256'],
      [roundId, payeeIdBytes32, amount],
    ),
  );
}

/** The ledger's detailsHash for a cost: the entry's own id makes each one unique. */
export function costFingerprint(c: {
  id: string;
  projectId: string;
  category: string;
  amount: bigint;
  incurredOn: string;
  note: string;
  photoHash: string | null;
}): string {
  return fingerprint('settlement.cost', {
    v: 1,
    entryId: c.id,
    projectId: c.projectId,
    category: c.category,
    amount: c.amount,
    incurredOn: c.incurredOn,
    note: c.note,
    photoHash: c.photoHash,
  });
}

/** The ledger's reasonHash when a round is sent back. */
export function rejectFingerprint(roundId: number, reason: string): string {
  return fingerprint('settlement.reject', { v: 1, roundId, reason });
}

/** Taka with a sign, for figures that can go below zero (a loss). */
export function signedTaka(poisha: bigint): string {
  return poisha < 0n ? `-${poishaToTaka(-poisha)}` : poishaToTaka(poisha);
}
