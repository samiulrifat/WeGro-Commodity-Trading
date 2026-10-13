import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Projects' activation and finish times from the indexed ProjectStageChanged
 * events (Active = 4; PaidOut = 6, Closed = 7: the first finishing stage counts).
 */
export const BACKFILL_STAGE_DATES = `UPDATE "projects" p
          SET "activated_at" = s."activated_at", "finished_at" = s."finished_at"
         FROM (SELECT args->>'projectId' AS project_key,
                      MIN(block_time) FILTER (WHERE (args->>'newStage')::int = 4) AS activated_at,
                      MIN(block_time) FILTER (WHERE (args->>'newStage')::int IN (6, 7)) AS finished_at
                 FROM "chain_event"
                WHERE args ? 'projectId' AND contract = 'ProjectLedger' AND event_name = 'ProjectStageChanged'
                GROUP BY 1) s
        WHERE s.project_key = '0x' || repeat('0', 32) || replace(p."id"::text, '-', '')`;

export class TrackRecord1791873366982 implements MigrationInterface {
  name = 'TrackRecord1791873366982';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bank_consents" ("id" uuid NOT NULL, "farmer_id" uuid NOT NULL, "bank_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "evidence_photo_id" uuid NOT NULL, "evidence_hash" character(66) NOT NULL, "granted_by_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "granted_at" TIMESTAMP WITH TIME ZONE, "revoked_by_id" uuid, "revoked_at" TIMESTAMP WITH TIME ZONE, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_bank_consents_status" CHECK ("status" IN ('submitted', 'active', 'replaced', 'revoked')), CONSTRAINT "PK_6089819c37a6b4c381d774bd4be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_bank_consents_evidence" ON "bank_consents"  ("evidence_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_consents_bank" ON "bank_consents"  ("bank_id", "status", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_consents_farmer_bank" ON "bank_consents"  ("farmer_id", "bank_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_officers" ("officer_id" uuid NOT NULL, "bank_id" uuid, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_411d46b7038ed886f8a7c55c22b" PRIMARY KEY ("officer_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_officers_bank" ON "bank_officers"  ("bank_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "banks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "branch_name" character varying(100) NOT NULL, "district_code" character varying(20) NOT NULL, "address" character varying(300) NOT NULL, "details_hash" character(66) NOT NULL, "status" character varying(10) NOT NULL, "created_by_id" uuid NOT NULL, CONSTRAINT "ck_banks_status" CHECK ("status" IN ('submitted', 'registered')), CONSTRAINT "PK_3975b5f684ec241e3901db62d77" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "summary_views" ("block_number" bigint NOT NULL, "log_index" integer NOT NULL, "farmer_id" uuid NOT NULL, "bank_id" uuid NOT NULL, "viewer_id" uuid NOT NULL, "version" integer NOT NULL, "viewed_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_1848add994fa7b7824a0f02e203" PRIMARY KEY ("block_number", "log_index"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_summary_views_farmer" ON "summary_views"  ("farmer_id", "viewed_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "track_records" ("id" uuid NOT NULL, "farmer_id" uuid NOT NULL, "version" integer, "summary" jsonb NOT NULL, "summary_hash" character(66) NOT NULL, "project_ids" uuid array NOT NULL, "published_by_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_track_records_version" CHECK (("status" = 'recorded') = ("version" IS NOT NULL)), CONSTRAINT "ck_track_records_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "PK_515d5ab2f47f0262b8d3c0f988f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_track_records_hash" ON "track_records"  ("summary_hash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_track_records_version" ON "track_records"  ("farmer_id", "version") WHERE "version" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "activated_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "finished_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Hand-written: a bank branch is unique regardless of case.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_banks_name_branch" ON "banks" (lower("name"), lower("branch_name"))`,
    );
    // Existing projects: stage dates from the indexed ledger events.
    await queryRunner.query(BACKFILL_STAGE_DATES);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_banks_name_branch"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "finished_at"`);
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "activated_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_track_records_version"`);
    await queryRunner.query(`DROP INDEX "public"."uq_track_records_hash"`);
    await queryRunner.query(`DROP TABLE "track_records"`);
    await queryRunner.query(`DROP INDEX "public"."ix_summary_views_farmer"`);
    await queryRunner.query(`DROP TABLE "summary_views"`);
    await queryRunner.query(`DROP TABLE "banks"`);
    await queryRunner.query(`DROP INDEX "public"."ix_bank_officers_bank"`);
    await queryRunner.query(`DROP TABLE "bank_officers"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_bank_consents_farmer_bank"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_bank_consents_bank"`);
    await queryRunner.query(`DROP INDEX "public"."uq_bank_consents_evidence"`);
    await queryRunner.query(`DROP TABLE "bank_consents"`);
  }
}
