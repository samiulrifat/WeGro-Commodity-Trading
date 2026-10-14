import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * audit_log.outcome gains 'aborted' (the client left before the response).
 * Widened in place: the log is append-only, so no row is rewritten or lost.
 */
export class AuditAborted1791973576696 implements MigrationInterface {
  name = 'AuditAborted1791973576696';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "ck_audit_log_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "outcome" TYPE character varying(8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "ck_audit_log_outcome" CHECK ("outcome" IN ('ok', 'failed', 'aborted'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Append-only rows cannot be changed: refuse rather than lose them.
    const [{ n }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM "audit_log" WHERE "outcome" = 'aborted'`,
    )) as Array<{ n: number }>;
    if (n > 0) {
      throw new Error(
        `${n} audit_log row(s) are 'aborted' and cannot be changed; not reverting`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "ck_audit_log_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "outcome" TYPE character varying(6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "ck_audit_log_outcome" CHECK ("outcome" IN ('ok', 'failed'))`,
    );
  }
}
