import { MigrationInterface, QueryRunner } from 'typeorm';

export class Jobs1791958459322 implements MigrationInterface {
  name = 'Jobs1791958459322';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "job_runs" ("id" BIGSERIAL NOT NULL, "job" character varying(50) NOT NULL, "trigger" character varying(8) NOT NULL, "triggered_by_id" uuid, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE NOT NULL, "outcome" character varying(6) NOT NULL, "items" integer NOT NULL, "error" character varying(500), CONSTRAINT "ck_job_runs_trigger" CHECK ("trigger" IN ('schedule', 'manual')), CONSTRAINT "ck_job_runs_outcome" CHECK ("outcome" IN ('ok', 'failed')), CONSTRAINT "PK_4d0012c04fcfc287550b76be7e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_job_runs_job" ON "job_runs"  ("job", "id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ix_job_runs_job"`);
    await queryRunner.query(`DROP TABLE "job_runs"`);
  }
}
