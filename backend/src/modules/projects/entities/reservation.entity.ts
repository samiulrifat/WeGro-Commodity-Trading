import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';
import { User } from '../../users/entities/user.entity';
import { ReservationStatus } from '../project.enums';
import { Project } from './project.entity';

/**
 * A reservation of slots, keyed by its ledger id. Rows are created from the
 * ledger's SlotsReserved event. `status` null means the row survived a full
 * re-index and has not been replayed yet; it then counts for nothing.
 *
 * The payment reference is kept encrypted for Accounts' reports; the ledger
 * holds only its keyed hash.
 */
@Entity('reservations')
@Check(
  'ck_reservations_status',
  `"status" IS NULL OR "status" IN ('pending', 'confirmed', 'expired', 'cancelled')`,
)
@Check('ck_reservations_slots', `"slots" > 0`)
@Index('ix_reservations_status_expiry', ['status', 'expiresAt'])
@Index('ix_reservations_project_status', ['projectId', 'status'])
@Index('ix_reservations_investor', ['investorId'])
@Index('uq_reservations_payment_ref', ['paymentRefHash'], {
  unique: true,
  where: '"payment_ref_hash" IS NOT NULL',
})
export class Reservation {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  id: number;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'uuid' })
  investorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'investor_id' })
  investor?: User;

  @Column({ type: 'int' })
  slots: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  status: ReservationStatus | null;

  @Column({ type: 'timestamptz' })
  reservedAt: Date;

  @Column({ type: 'text', nullable: true })
  paymentRefEnc: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  paymentRefHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  confirmedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
