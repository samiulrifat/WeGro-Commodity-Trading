import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The official list of banks, districts and branches with routing numbers,
 * and a record of each import. Filled from the bundled files at startup.
 */

export class BankList1792407331205 implements MigrationInterface {
  name = 'BankList1792407331205';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bank_list_banks" ("code" smallint NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "PK_a1753d473167b3df206552076c9" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_list_imports" ("id" SERIAL NOT NULL, "source" character varying(10) NOT NULL, "imported_by_id" uuid, "branches_sha256" character(64) NOT NULL, "districts_sha256" character(64), "bank_count" integer NOT NULL, "district_count" integer NOT NULL, "branch_count" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ea02ae9bde92b09436038a0d1a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_list_branches" ("routing_number" character(9) NOT NULL, "bank_code" smallint NOT NULL, "district_code" smallint NOT NULL, "branch_code" smallint NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "PK_e381817a180128b079ab8685fdb" PRIMARY KEY ("routing_number"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_list_branches_bank_district" ON "bank_list_branches"  ("bank_code", "district_code", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_list_districts" ("code" smallint NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "PK_6c3ff98217707d4fbd7c4d6590c" PRIMARY KEY ("code"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bank_list_districts"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_bank_list_branches_bank_district"`,
    );
    await queryRunner.query(`DROP TABLE "bank_list_branches"`);
    await queryRunner.query(`DROP TABLE "bank_list_imports"`);
    await queryRunner.query(`DROP TABLE "bank_list_banks"`);
  }
}
