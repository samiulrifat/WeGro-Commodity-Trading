import { MigrationInterface, QueryRunner } from 'typeorm';

export class DealProofs1792580000000 implements MigrationInterface {
  name = 'DealProofs1792580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "deal_proofs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "offer_id" bigint NOT NULL, "buyer_id" uuid NOT NULL, "amount" bigint NOT NULL, "transferred_on" date NOT NULL, "method" character varying(12) NOT NULL, "bank_name" character varying(100), "branch_name" character varying(100), "district_name" character varying(100), "routing_number" character(9), "reference_enc" text, "note" character varying(500), "status" character varying(10) NOT NULL, "verified_ref_enc" text, "verified_ref_hash" character(66), "decided_by_id" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" character varying(300), "refund_ref_enc" text, "refund_ref_hash" character(66), "refunded_by_id" uuid, "refunded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_deal_proofs_method" CHECK ("method" IN ('bank_deposit', 'cash', 'cheque')), CONSTRAINT "ck_deal_proofs_status" CHECK ("status" IN ('pending', 'accepted', 'rejected')), CONSTRAINT "ck_deal_proofs_routing" CHECK ("routing_number" IS NULL OR "routing_number" ~ '^[0-9]{9}$'), CONSTRAINT "ck_deal_proofs_amount" CHECK ("amount" > 0), CONSTRAINT "PK_7bfd1ea5f503edb3066a7c9b272" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_deal_proofs_refund_ref" ON "deal_proofs"  ("refund_ref_hash") WHERE "refund_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_deal_proofs_verified_ref" ON "deal_proofs"  ("verified_ref_hash") WHERE "verified_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_deal_proofs_pending" ON "deal_proofs"  ("created_at") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_deal_proofs_offer" ON "deal_proofs"  ("offer_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "deal_proof_files" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "proof_id" uuid NOT NULL, "mime_type" character varying(40) NOT NULL, "size_bytes" integer NOT NULL, "sha256" character(64) NOT NULL, "storage_path" character varying(200) NOT NULL, CONSTRAINT "PK_1536bc29d83eb435380ba88d5e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_deal_proof_files_proof" ON "deal_proof_files"  ("proof_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "paused_remaining" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "hold_event_block" bigint NOT NULL DEFAULT '-1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "hold_event_log" integer NOT NULL DEFAULT '-1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_proof_files" ADD CONSTRAINT "FK_f4355a0f493e66daaac05fec19f" FOREIGN KEY ("proof_id") REFERENCES "deal_proofs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deal_proof_files" DROP CONSTRAINT "FK_f4355a0f493e66daaac05fec19f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "hold_event_log"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "hold_event_block"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "paused_remaining"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_deal_proof_files_proof"`);
    await queryRunner.query(`DROP TABLE "deal_proof_files"`);
    await queryRunner.query(`DROP INDEX "public"."ix_deal_proofs_offer"`);
    await queryRunner.query(`DROP INDEX "public"."ix_deal_proofs_pending"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_deal_proofs_verified_ref"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_deal_proofs_refund_ref"`);
    await queryRunner.query(`DROP TABLE "deal_proofs"`);
  }
}
