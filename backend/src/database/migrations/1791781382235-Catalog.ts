import { MigrationInterface, QueryRunner } from 'typeorm';

export class Catalog1791781382235 implements MigrationInterface {
  name = 'Catalog1791781382235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "field_record_types" ("code" character varying(31) NOT NULL, "name" character varying(80) NOT NULL, "name_bn" character varying(80) NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requires_photo" boolean NOT NULL DEFAULT false, "requires_location" boolean NOT NULL DEFAULT true, "measurements" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_07ebe58ca7ec9105b1830784087" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "units" ("code" character varying(31) NOT NULL, "name" character varying(80) NOT NULL, "name_bn" character varying(80) NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "kind" character varying(10) NOT NULL, "symbol" character varying(12) NOT NULL, CONSTRAINT "PK_47635c1ab22d02fc3ebae3608b8" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "produce_types" ("code" character varying(31) NOT NULL, "name" character varying(80) NOT NULL, "name_bn" character varying(80) NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "category" character varying(16) NOT NULL, "unit_code" character varying(31) NOT NULL, "typical_duration_months" smallint, "description" character varying(500), "description_bn" character varying(500), CONSTRAINT "PK_b490003d8f8028e78e122005559" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_produce_types_category" ON "produce_types"  ("category") `,
    );
    await queryRunner.query(
      `CREATE TABLE "input_types" ("code" character varying(31) NOT NULL, "name" character varying(80) NOT NULL, "name_bn" character varying(80) NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "kind" character varying(12) NOT NULL, "unit_code" character varying(31) NOT NULL, "produce_code" character varying(31), "description" character varying(500), CONSTRAINT "PK_0f2d5d0492f553d7cc268965c49" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_input_types_kind" ON "input_types"  ("kind") `,
    );
    await queryRunner.query(
      `CREATE TABLE "weather_event_types" ("code" character varying(31) NOT NULL, "name" character varying(80) NOT NULL, "name_bn" character varying(80) NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "description" character varying(500), CONSTRAINT "PK_3478af410c0f7b81047c95e4b73" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "produce_types" ADD CONSTRAINT "FK_4959e3854bc485dcc67e0d1b461" FOREIGN KEY ("unit_code") REFERENCES "units"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_types" ADD CONSTRAINT "FK_9f0800e7e7aa82d60562f52b36f" FOREIGN KEY ("unit_code") REFERENCES "units"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_types" ADD CONSTRAINT "FK_b9294de1215b6cb4e1e2fa808dc" FOREIGN KEY ("produce_code") REFERENCES "produce_types"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Hand-written: case-insensitive unique names and value checks, which entities cannot express.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_units_name" ON "units" (lower("name"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "ck_units_code" CHECK ("code" ~ '^[A-Z0-9_-]{1,31}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_produce_types_name" ON "produce_types" (lower("name"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "produce_types" ADD CONSTRAINT "ck_produce_types_code" CHECK ("code" ~ '^[A-Z0-9_-]{1,31}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_input_types_name" ON "input_types" (lower("name"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_types" ADD CONSTRAINT "ck_input_types_code" CHECK ("code" ~ '^[A-Z0-9_-]{1,31}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_field_record_types_name" ON "field_record_types" (lower("name"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_record_types" ADD CONSTRAINT "ck_field_record_types_code" CHECK ("code" ~ '^[A-Z0-9_-]{1,31}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_weather_event_types_name" ON "weather_event_types" (lower("name"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "weather_event_types" ADD CONSTRAINT "ck_weather_event_types_code" CHECK ("code" ~ '^[A-Z0-9_-]{1,31}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "ck_units_kind" CHECK ("kind" IN ('mass', 'volume', 'count'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "produce_types" ADD CONSTRAINT "ck_produce_types_category" CHECK ("category" IN ('storable_crop', 'spice', 'perishable'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "produce_types" ADD CONSTRAINT "ck_produce_types_duration" CHECK ("typical_duration_months" BETWEEN 1 AND 60)`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_types" ADD CONSTRAINT "ck_input_types_kind" CHECK ("kind" IN ('seed', 'fertilizer', 'pesticide', 'other'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_units_name"`);
    await queryRunner.query(`DROP INDEX "public"."uq_produce_types_name"`);
    await queryRunner.query(`DROP INDEX "public"."uq_input_types_name"`);
    await queryRunner.query(`DROP INDEX "public"."uq_field_record_types_name"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_weather_event_types_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_types" DROP CONSTRAINT "FK_b9294de1215b6cb4e1e2fa808dc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_types" DROP CONSTRAINT "FK_9f0800e7e7aa82d60562f52b36f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "produce_types" DROP CONSTRAINT "FK_4959e3854bc485dcc67e0d1b461"`,
    );
    await queryRunner.query(`DROP TABLE "weather_event_types"`);
    await queryRunner.query(`DROP INDEX "public"."ix_input_types_kind"`);
    await queryRunner.query(`DROP TABLE "input_types"`);
    await queryRunner.query(`DROP INDEX "public"."ix_produce_types_category"`);
    await queryRunner.query(`DROP TABLE "produce_types"`);
    await queryRunner.query(`DROP TABLE "units"`);
    await queryRunner.query(`DROP TABLE "field_record_types"`);
  }
}
