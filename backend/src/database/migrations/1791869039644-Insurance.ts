import { MigrationInterface, QueryRunner } from 'typeorm';

export class Insurance1791869039644 implements MigrationInterface {
  name = 'Insurance1791869039644';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "coverage_terms" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL, "insurer_id" uuid NOT NULL, "max_amount" bigint NOT NULL, "covered_event_types" character varying(31) array NOT NULL, "notes" character varying(2000), "terms_hash" character(66) NOT NULL, "previous_terms_hash" character(66), "status" character varying(10) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_coverage_terms_max" CHECK ("max_amount" > 0), CONSTRAINT "ck_coverage_terms_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "PK_c0903421f7cdea5cf2823cac7af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_coverage_terms_current" ON "coverage_terms"  ("project_id", "status", "chain_event_block", "chain_event_log") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_coverage_terms_hash" ON "coverage_terms"  ("project_id", "terms_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "insurance_claims" ("id" uuid NOT NULL, "project_id" uuid NOT NULL, "event_id" uuid NOT NULL, "damage_percent" numeric(4,1) NOT NULL, "notes" character varying(2000) NOT NULL, "photo_ids" uuid array NOT NULL DEFAULT '{}', "claim_hash" character(66) NOT NULL, "opened_by_id" uuid NOT NULL, "status" character varying(14) NOT NULL, "opened_at" TIMESTAMP WITH TIME ZONE, "assessed_damage_percent" numeric(4,1), "assessment_notes" character varying(2000), "assessment_photo_id" uuid, "assessment_hash" character(66), "approved_amount" bigint, "reviewed_by_id" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_insurance_claims_amount" CHECK (("approved_amount" IS NULL) OR ("approved_amount" > 0 AND "status" = 'approved')), CONSTRAINT "ck_insurance_claims_damage" CHECK ("damage_percent" BETWEEN 0 AND 100 AND ("assessed_damage_percent" IS NULL OR "assessed_damage_percent" BETWEEN 0 AND 100)), CONSTRAINT "ck_insurance_claims_status" CHECK ("status" IN ('submitted', 'triggered', 'under_review', 'approved', 'rejected')), CONSTRAINT "PK_c6f7929fdcec8c17a24034a48d3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_insurance_claims_status" ON "insurance_claims"  ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_insurance_claims_project_event" ON "insurance_claims"  ("project_id", "event_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "weather_events" ("id" uuid NOT NULL, "district_code" character varying(20) NOT NULL, "event_type_code" character varying(31) NOT NULL, "occurred_on" date NOT NULL, "severity" character varying(10) NOT NULL, "notes" character varying(2000), "details_hash" character(66) NOT NULL, "recorded_by_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_weather_events_severity" CHECK ("severity" IN ('low', 'moderate', 'severe')), CONSTRAINT "ck_weather_events_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "PK_a6e674eaad02928efa3cc82ecd4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_weather_events_district" ON "weather_events"  ("district_code", "occurred_on") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ix_weather_events_district"`);
    await queryRunner.query(`DROP TABLE "weather_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_insurance_claims_project_event"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_insurance_claims_status"`);
    await queryRunner.query(`DROP TABLE "insurance_claims"`);
    await queryRunner.query(`DROP INDEX "public"."uq_coverage_terms_hash"`);
    await queryRunner.query(`DROP INDEX "public"."ix_coverage_terms_current"`);
    await queryRunner.query(`DROP TABLE "coverage_terms"`);
  }
}
