import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SMS codes get a purpose (password reset, or confirming a new number):
 * the reset codes' table is renamed, its rows kept as password resets. And
 * requests to change one's own details, waiting for an admin.
 */
export class DetailChanges1792384571935 implements MigrationInterface {
  name = 'DetailChanges1792384571935';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_codes" RENAME TO "sms_codes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" ADD "purpose" character varying(20) NOT NULL DEFAULT 'password-reset'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" ALTER COLUMN "purpose" DROP DEFAULT`,
    );
    await queryRunner.query(`DROP INDEX "ix_password_reset_codes_phone"`);
    await queryRunner.query(
      `CREATE INDEX "ix_sms_codes_phone" ON "sms_codes" ("purpose", "phone_index", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" RENAME CONSTRAINT "PK_password_reset_codes" TO "PK_sms_codes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" RENAME CONSTRAINT "FK_password_reset_codes_user" TO "FK_7d8cc5e61db9ec0f9842c8a0b1e"`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE "password_reset_codes_id_seq" RENAME TO "sms_codes_id_seq"`,
    );
    await queryRunner.query(
      `CREATE TABLE "detail_change_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "details_enc" text NOT NULL, "changed_fields" character varying(20) array NOT NULL, "phone_index" character(64) NOT NULL, "nid_index" character(64), "id_check" jsonb, "decided_by_id" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "reason" character varying(300), "tx_hash" character(66), CONSTRAINT "ck_detail_change_requests_status" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')), CONSTRAINT "PK_detail_change_requests" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_detail_change_requests_pending" ON "detail_change_requests" ("user_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_detail_change_requests_status" ON "detail_change_requests" ("status", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "detail_change_requests" ADD CONSTRAINT "FK_de2186708e95f72fe7dddbaa70f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "detail_change_requests"`);
    await queryRunner.query(
      `DELETE FROM "sms_codes" WHERE "purpose" <> 'password-reset'`,
    );
    await queryRunner.query(`DROP INDEX "ix_sms_codes_phone"`);
    await queryRunner.query(`ALTER TABLE "sms_codes" DROP COLUMN "purpose"`);
    await queryRunner.query(
      `CREATE INDEX "ix_password_reset_codes_phone" ON "sms_codes" ("phone_index", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" RENAME CONSTRAINT "PK_sms_codes" TO "PK_password_reset_codes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" RENAME CONSTRAINT "FK_7d8cc5e61db9ec0f9842c8a0b1e" TO "FK_password_reset_codes_user"`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE "sms_codes_id_seq" RENAME TO "password_reset_codes_id_seq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_codes" RENAME TO "password_reset_codes"`,
    );
  }
}
