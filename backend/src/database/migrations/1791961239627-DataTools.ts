import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataTools1791961239627 implements MigrationInterface {
  name = 'DataTools1791961239627';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "import_records" ("kind" character varying(20) NOT NULL, "external_id" character varying(100) NOT NULL, "internal_id" character varying(66) NOT NULL, "imported_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_558ce0992b73add0884e5d32bc6" PRIMARY KEY ("kind", "external_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "legacy_projects" ("id" uuid NOT NULL, "farmer_id" uuid NOT NULL, "title" character varying(120) NOT NULL, "produce_code" character varying(31) NOT NULL, "district_code" character varying(20) NOT NULL, "started_on" date NOT NULL, "finished_on" date NOT NULL, "funding_raised" bigint NOT NULL, "income" bigint NOT NULL, "costs" bigint NOT NULL, "farmer_received" bigint NOT NULL, "harvested" numeric(14,3), "sold" numeric(14,3), "notes" character varying(1000), "imported_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_legacy_projects_money" CHECK ("funding_raised" >= 0 AND "income" >= 0 AND "costs" >= 0 AND "farmer_received" >= 0), CONSTRAINT "ck_legacy_projects_dates" CHECK ("finished_on" >= "started_on"), CONSTRAINT "PK_5b888ea32a570711f676fc0d871" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_legacy_projects_farmer" ON "legacy_projects"  ("farmer_id", "finished_on") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ix_legacy_projects_farmer"`);
    await queryRunner.query(`DROP TABLE "legacy_projects"`);
    await queryRunner.query(`DROP TABLE "import_records"`);
  }
}
