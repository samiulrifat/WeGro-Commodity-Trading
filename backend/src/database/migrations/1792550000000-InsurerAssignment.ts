import { MigrationInterface, QueryRunner } from 'typeorm';

export class InsurerAssignment1792550000000 implements MigrationInterface {
  name = 'InsurerAssignment1792550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "insurer_assignments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL, "insurer_id" uuid NOT NULL, "assigned_by_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_insurer_assignments_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "PK_2df9cf9d25bd7b4ea8737c7d287" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_insurer_assignments_insurer" ON "insurer_assignments"  ("insurer_id", "project_id") WHERE "status" = 'recorded'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_insurer_assignments_current" ON "insurer_assignments"  ("project_id", "status", "chain_event_block", "chain_event_log") `,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD "payment_ref_enc" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD "payment_ref_hash" character(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD "paid_by_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD "paid_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_insurance_claims_payment_due" ON "insurance_claims"  ("decided_at") WHERE "status" = 'approved'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_insurance_claims_payment_ref" ON "insurance_claims"  ("payment_ref_hash") WHERE "payment_ref_hash" IS NOT NULL`,
    );
    // Not generated: check expressions changed for the new paid status.
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP CONSTRAINT "ck_insurance_claims_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD CONSTRAINT "ck_insurance_claims_status" CHECK ("status" IN ('submitted', 'triggered', 'under_review', 'approved', 'rejected', 'paid'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP CONSTRAINT "ck_insurance_claims_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD CONSTRAINT "ck_insurance_claims_amount" CHECK (("approved_amount" IS NULL) OR ("approved_amount" > 0 AND "status" IN ('approved', 'paid')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP CONSTRAINT "ck_insurance_claims_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD CONSTRAINT "ck_insurance_claims_amount" CHECK (("approved_amount" IS NULL) OR ("approved_amount" > 0 AND "status" = 'approved'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP CONSTRAINT "ck_insurance_claims_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" ADD CONSTRAINT "ck_insurance_claims_status" CHECK ("status" IN ('submitted', 'triggered', 'under_review', 'approved', 'rejected'))`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_insurance_claims_payment_ref"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_insurance_claims_payment_due"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP COLUMN "paid_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP COLUMN "paid_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP COLUMN "payment_ref_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurance_claims" DROP COLUMN "payment_ref_enc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_insurer_assignments_current"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_insurer_assignments_insurer"`,
    );
    await queryRunner.query(`DROP TABLE "insurer_assignments"`);
  }
}
