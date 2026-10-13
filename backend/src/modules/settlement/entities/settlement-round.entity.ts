import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { RoundStatus } from '../settlement.enums';

/**
 * A payout round as the ledger prepared it. The split, per-payee lines and
 * rounding remainder are worked out again here and checked against the
 * ledger's fingerprint and line hashes. A null status hides the row during a
 * rebuild from the ledger; the reason for a rejection is kept here, hashed
 * on the ledger.
 */
@Entity('settlement_rounds')
@Index('ix_settlement_rounds_project', ['projectId', 'id'])
@Index('ix_settlement_rounds_status', ['status', 'approvedAt'])
@Check(
  'ck_settlement_rounds_status',
  `"status" IS NULL OR "status" IN ('prepared', 'approved', 'rejected', 'paid')`,
)
@Check(
  'ck_settlement_rounds_split',
  `"farmer_share" + "investor_share" + "wegro_share" <= "profit" AND "paid_count" <= "payee_count"`,
)
export class SettlementRound {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  id: number;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'boolean' })
  isFinal: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  status: RoundStatus | null;

  // --- Figures, poisha ---

  @Column({ type: 'bigint', transformer: bigintTransformer })
  income: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  costs: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  profit: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  farmerShare: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  investorShare: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  wegroShare: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  capitalReturn: bigint;

  /** Rounding remainder, kept by WeGro. */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  leftover: bigint;

  @Column({ type: 'char', length: 66 })
  fingerprint: string;

  /** The figures and every line worked out here match the ledger. */
  @Column({ type: 'boolean' })
  verified: boolean;

  // --- Who and when ---

  @Column({ type: 'uuid' })
  preparedById: string;

  @Column({ type: 'timestamptz' })
  preparedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  rejectReason: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  rejectReasonHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  rejectedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ type: 'int' })
  payeeCount: number;

  @Column({ type: 'int', default: 0 })
  paidCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}
