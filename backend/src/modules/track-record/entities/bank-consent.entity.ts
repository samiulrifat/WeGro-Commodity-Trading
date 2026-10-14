import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';
import { ConsentStatus } from '../track-record.enums';

/**
 * One grant of a farmer's permission for a bank to view their track record,
 * with the photo of the farmer's signed consent form, fingerprinted on the
 * ledger. A renewal is a new grant; earlier ones are kept as history.
 */
@Entity('bank_consents')
@Index('ix_bank_consents_farmer_bank', ['farmerId', 'bankId', 'status'])
@Index('ix_bank_consents_bank', ['bankId', 'status', 'expiresAt'])
@Index('uq_bank_consents_evidence', ['evidenceHash'], { unique: true })
@Check(
  'ck_bank_consents_status',
  `"status" IN ('submitted', 'active', 'replaced', 'revoked')`,
)
@Index('ix_bank_consents_expiring', ['expiresAt'], {
  where: `"status" = 'active'`,
})
export class BankConsent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  farmerId: string;

  @Column({ type: 'uuid' })
  bankId: string;

  /** The ledger's expiry: the end of the last valid day (Bangladesh). */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'uuid' })
  evidencePhotoId: string;

  @Column({ type: 'char', length: 66 })
  evidenceHash: string;

  @Column({ type: 'uuid' })
  grantedById: string;

  @Column({ type: 'varchar', length: 10 })
  status: ConsentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  grantedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  revokedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
