import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1791955103399 implements MigrationInterface {
  name = 'Notifications1791955103399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" BIGSERIAL NOT NULL, "user_id" uuid NOT NULL, "category" character varying(8) NOT NULL, "kind" character varying(40) NOT NULL, "title" character varying(200) NOT NULL, "body" character varying(500), "subject_type" character varying(30), "subject_id" character varying(66), "dedupe_key" character varying(200) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_notifications_category" CHECK ("category" IN ('reminder', 'action', 'outcome')), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notifications_dedupe" ON "notifications"  ("dedupe_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notifications_unread" ON "notifications"  ("user_id") WHERE "read_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notifications_user" ON "notifications"  ("user_id", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_consents_expiring" ON "bank_consents"  ("expires_at") WHERE "status" = 'active'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_receipts_expiring" ON "warehouse_receipts"  ("expires_on") WHERE "status" IN ('issued', 'listed', 'pending_handover')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_receipts_expiring"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_bank_consents_expiring"`);
    await queryRunner.query(`DROP INDEX "public"."ix_notifications_user"`);
    await queryRunner.query(`DROP INDEX "public"."ix_notifications_unread"`);
    await queryRunner.query(`DROP INDEX "public"."uq_notifications_dedupe"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
