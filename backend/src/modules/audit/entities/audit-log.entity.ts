import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** ok / failed: the response's status; aborted: the client left first (status 499). */
export const AUDIT_OUTCOMES = ['ok', 'failed', 'aborted'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Every write request: who, what, on which record, and the result. No
 * request bodies, so no personal data. Append-only: a database trigger
 * refuses updates and deletes.
 */
@Entity('audit_log')
@Index('ix_audit_log_at', ['at'])
@Index('ix_audit_log_actor', ['actorId', 'at'])
@Index('ix_audit_log_route', ['route', 'at'])
@Check('ck_audit_log_outcome', `"outcome" IN ('ok', 'failed', 'aborted')`)
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  at: Date;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  role: string | null;

  @Column({ type: 'varchar', length: 7 })
  method: string;

  /** The route pattern, e.g. /api/settlement/rounds/:id/approve. */
  @Column({ type: 'varchar', length: 200 })
  route: string;

  /** Record ids from the path. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  params: Record<string, string>;

  @Column({ type: 'smallint' })
  statusCode: number;

  @Column({ type: 'varchar', length: 8 })
  outcome: AuditOutcome;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  @Column({ type: 'int' })
  durationMs: number;
}
