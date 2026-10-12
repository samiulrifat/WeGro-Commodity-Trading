import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldRecords1791800189242 implements MigrationInterface {
  name = 'FieldRecords1791800189242';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "photos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "sha256" character(64) NOT NULL, "mime_type" character varying(20) NOT NULL, "size_bytes" integer NOT NULL, "storage_path" character varying(200) NOT NULL, "uploaded_by_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_photos_size" CHECK ("size_bytes" > 0), CONSTRAINT "ck_photos_type" CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp')), CONSTRAINT "PK_5220c45b8e32d49d767b9b3d725" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_photos_sha256" ON "photos"  ("sha256") `,
    );
    await queryRunner.query(
      `CREATE TABLE "field_records" ("id" uuid NOT NULL, "project_id" uuid NOT NULL, "entry_type_code" character varying(31) NOT NULL, "notes" character varying(2000), "measurements" jsonb NOT NULL DEFAULT '{}', "latitude" numeric(9,6), "longitude" numeric(9,6), "accuracy_meters" integer, "photo_id" uuid, "corrects_entry_id" uuid, "recorded_by_id" uuid NOT NULL, "observed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "data_hash" character(66) NOT NULL, "photo_hash" character(66), "status" character varying(10) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE, "tx_hash" character(66), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_field_records_photo" CHECK (("photo_id" IS NULL) = ("photo_hash" IS NULL)), CONSTRAINT "ck_field_records_location" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)), CONSTRAINT "ck_field_records_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "PK_befbb9e0c9b8af9ee89d29805d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_field_records_corrects" ON "field_records"  ("corrects_entry_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_field_records_project_observed" ON "field_records"  ("project_id", "observed_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "field_records" ADD CONSTRAINT "FK_fbfe45a7f20683be6be4814bb3d" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_records" ADD CONSTRAINT "FK_3d6bd23a2967b45fb9f0a2b059e" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "field_records" DROP CONSTRAINT "FK_3d6bd23a2967b45fb9f0a2b059e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_records" DROP CONSTRAINT "FK_fbfe45a7f20683be6be4814bb3d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_field_records_project_observed"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_field_records_corrects"`);
    await queryRunner.query(`DROP TABLE "field_records"`);
    await queryRunner.query(`DROP INDEX "public"."uq_photos_sha256"`);
    await queryRunner.query(`DROP TABLE "photos"`);
  }
}
