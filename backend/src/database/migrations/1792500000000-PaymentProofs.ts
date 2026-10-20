import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paying for bookings: WeGro's payment accounts, investors' payment proofs
 * and their encrypted files, the booking clock that stops while a proof is
 * reviewed, favourites, and a project's cover photo.
 */

export class PaymentProofs1792500000000 implements MigrationInterface {
  name = 'PaymentProofs1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payment_accounts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "bank_name" character varying(100) NOT NULL, "branch_name" character varying(100) NOT NULL, "district_name" character varying(100), "routing_number" character(9) NOT NULL, "account_name" character varying(100) NOT NULL, "account_number" character varying(20) NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" smallint NOT NULL DEFAULT '0', "created_by_id" uuid NOT NULL, "updated_by_id" uuid NOT NULL, CONSTRAINT "PK_30d855e954ca88f8d6badbab40e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_proofs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reservation_id" bigint NOT NULL, "investor_id" uuid NOT NULL, "amount" bigint NOT NULL, "transferred_on" date NOT NULL, "method" character varying(12) NOT NULL, "bank_name" character varying(100), "reference_enc" text, "note" character varying(500), "status" character varying(10) NOT NULL, "verified_ref_enc" text, "verified_ref_hash" character(66), "decided_by_id" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" character varying(300), "refund_ref_enc" text, "refund_ref_hash" character(66), "refunded_by_id" uuid, "refunded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_payment_proofs_method" CHECK ("method" IN ('bank_deposit', 'cash', 'cheque')), CONSTRAINT "ck_payment_proofs_status" CHECK ("status" IN ('pending', 'accepted', 'rejected')), CONSTRAINT "ck_payment_proofs_amount" CHECK ("amount" > 0), CONSTRAINT "PK_fdea03d16d4d7450e41c94e1622" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payment_proofs_refund_ref" ON "payment_proofs"  ("refund_ref_hash") WHERE "refund_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payment_proofs_verified_ref" ON "payment_proofs"  ("verified_ref_hash") WHERE "verified_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payment_proofs_pending" ON "payment_proofs"  ("created_at") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payment_proofs_reservation" ON "payment_proofs"  ("reservation_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_proof_files" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "proof_id" uuid NOT NULL, "mime_type" character varying(40) NOT NULL, "size_bytes" integer NOT NULL, "sha256" character(64) NOT NULL, "storage_path" character varying(200) NOT NULL, CONSTRAINT "PK_bb8ee9be4fbe048e5223233ee20" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payment_proof_files_proof" ON "payment_proof_files"  ("proof_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_favourites" ("investor_id" uuid NOT NULL, "project_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f2a7c503a21eba2c679a2d2fbe" PRIMARY KEY ("investor_id", "project_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_project_favourites_project" ON "project_favourites"  ("project_id") `,
    );
    await queryRunner.query(`ALTER TABLE "projects" ADD "cover_photo_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "paused_remaining" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "hold_event_block" bigint NOT NULL DEFAULT '-1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "hold_event_log" integer NOT NULL DEFAULT '-1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proof_files" ADD CONSTRAINT "FK_bad6574b5e48532373e5e4c79e5" FOREIGN KEY ("proof_id") REFERENCES "payment_proofs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_proof_files" DROP CONSTRAINT "FK_bad6574b5e48532373e5e4c79e5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "hold_event_log"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "hold_event_block"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "paused_remaining"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "cover_photo_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_project_favourites_project"`,
    );
    await queryRunner.query(`DROP TABLE "project_favourites"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_payment_proof_files_proof"`,
    );
    await queryRunner.query(`DROP TABLE "payment_proof_files"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_payment_proofs_reservation"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_payment_proofs_pending"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_payment_proofs_verified_ref"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_payment_proofs_refund_ref"`,
    );
    await queryRunner.query(`DROP TABLE "payment_proofs"`);
    await queryRunner.query(`DROP TABLE "payment_accounts"`);
  }
}
