import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClaimProofs1792600000000 implements MigrationInterface {
  name = 'ClaimProofs1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "claim_proofs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "claim_id" uuid NOT NULL, "insurer_id" uuid NOT NULL, "amount" bigint NOT NULL, "transferred_on" date NOT NULL, "method" character varying(12) NOT NULL, "bank_name" character varying(100), "branch_name" character varying(100), "district_name" character varying(100), "routing_number" character(9), "reference_enc" text, "note" character varying(500), "status" character varying(10) NOT NULL, "verified_ref_enc" text, "verified_ref_hash" character(66), "decided_by_id" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" character varying(300), CONSTRAINT "ck_claim_proofs_method" CHECK ("method" IN ('bank_deposit', 'cash', 'cheque')), CONSTRAINT "ck_claim_proofs_status" CHECK ("status" IN ('pending', 'accepted', 'rejected')), CONSTRAINT "ck_claim_proofs_routing" CHECK ("routing_number" IS NULL OR "routing_number" ~ '^[0-9]{9}$'), CONSTRAINT "ck_claim_proofs_amount" CHECK ("amount" > 0), CONSTRAINT "PK_37c4a670812ee77a405f7713eae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_claim_proofs_verified_ref" ON "claim_proofs"  ("verified_ref_hash") WHERE "verified_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_claim_proofs_pending" ON "claim_proofs"  ("created_at") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_claim_proofs_claim" ON "claim_proofs"  ("claim_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "claim_proof_files" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "proof_id" uuid NOT NULL, "mime_type" character varying(40) NOT NULL, "size_bytes" integer NOT NULL, "sha256" character(64) NOT NULL, "storage_path" character varying(200) NOT NULL, CONSTRAINT "PK_a4fe3e63a5ebc0df35f4bf6567d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_claim_proof_files_proof" ON "claim_proof_files"  ("proof_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_proof_files" ADD CONSTRAINT "FK_ba19eaed6c84afbb5d5f41f7300" FOREIGN KEY ("proof_id") REFERENCES "claim_proofs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claim_proof_files" DROP CONSTRAINT "FK_ba19eaed6c84afbb5d5f41f7300"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_claim_proof_files_proof"`);
    await queryRunner.query(`DROP TABLE "claim_proof_files"`);
    await queryRunner.query(`DROP INDEX "public"."ix_claim_proofs_claim"`);
    await queryRunner.query(`DROP INDEX "public"."ix_claim_proofs_pending"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_claim_proofs_verified_ref"`,
    );
    await queryRunner.query(`DROP TABLE "claim_proofs"`);
  }
}
