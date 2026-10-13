import { MigrationInterface, QueryRunner } from 'typeorm';

export class Audit1791884624605 implements MigrationInterface {
  name = 'Audit1791884624605';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "verification_findings" ("run_id" uuid NOT NULL, "type" character varying(20) NOT NULL, "record_id" character varying(66) NOT NULL, "mismatches" character varying(200) array NOT NULL, CONSTRAINT "PK_d825a066cfc30721f5d8e362bbc" PRIMARY KEY ("run_id", "type", "record_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" BIGSERIAL NOT NULL, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actor_id" uuid, "role" character varying(20), "method" character varying(7) NOT NULL, "route" character varying(200) NOT NULL, "params" jsonb NOT NULL DEFAULT '{}', "status_code" smallint NOT NULL, "outcome" character varying(6) NOT NULL, "request_id" character varying(64), "duration_ms" integer NOT NULL, CONSTRAINT "ck_audit_log_outcome" CHECK ("outcome" IN ('ok', 'failed')), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_route" ON "audit_log"  ("route", "at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_actor" ON "audit_log"  ("actor_id", "at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_at" ON "audit_log"  ("at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "verification_runs" ("id" uuid NOT NULL, "status" character varying(12) NOT NULL, "started_by_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE, "checked" integer NOT NULL DEFAULT '0', "mismatched" integer NOT NULL DEFAULT '0', "error" character varying(500), CONSTRAINT "ck_verification_runs_status" CHECK ("status" IN ('running', 'done', 'failed', 'interrupted')), CONSTRAINT "PK_b7dbc4e1be46e62a753e8142b87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_verification_runs_started" ON "verification_runs"  ("started_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "chain_event" ADD "tx_from" character(42)`,
    );
    // Hand-written: any record's history by its id in any event argument.
    await queryRunner.query(
      `CREATE INDEX "ix_chain_event_args" ON "chain_event" USING gin ("args" jsonb_path_ops)`,
    );
    // Hand-written: the audit log is append-only, whoever connects.
    await queryRunner.query(
      `CREATE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'audit_log is append-only';
       END $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "tr_audit_log_no_change" BEFORE UPDATE OR DELETE ON "audit_log"
         FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "tr_audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
         FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "tr_audit_log_no_truncate" ON "audit_log"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "tr_audit_log_no_change" ON "audit_log"`,
    );
    await queryRunner.query(`DROP FUNCTION "audit_log_append_only"()`);
    await queryRunner.query(`DROP INDEX "public"."ix_chain_event_args"`);
    await queryRunner.query(`ALTER TABLE "chain_event" DROP COLUMN "tx_from"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_verification_runs_started"`,
    );
    await queryRunner.query(`DROP TABLE "verification_runs"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_log_at"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_log_actor"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_log_route"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TABLE "verification_findings"`);
  }
}
