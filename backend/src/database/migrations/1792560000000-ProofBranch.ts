import { MigrationInterface, QueryRunner } from 'typeorm';

/** The branch a deposit or cheque was paid from, beside its bank. */
export class ProofBranch1792560000000 implements MigrationInterface {
  name = 'ProofBranch1792560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" ADD "branch_name" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" ADD "district_name" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" ADD "routing_number" character(9)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" ADD CONSTRAINT "ck_payment_proofs_routing" CHECK ("routing_number" IS NULL OR "routing_number" ~ '^[0-9]{9}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" DROP CONSTRAINT "ck_payment_proofs_routing"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" DROP COLUMN "routing_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" DROP COLUMN "district_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_proofs" DROP COLUMN "branch_name"`,
    );
  }
}
