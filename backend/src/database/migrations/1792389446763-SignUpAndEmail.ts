import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Codes are confirmed by email too, and for signing up: the SMS codes' table
 * becomes verification_codes, keyed by the number's or the address's index,
 * and records whether each code went out (earlier rows: sent if they had a
 * person). A confirmed email address signs in like the number: its index on
 * users, the address encrypted with the person's details.
 */
export class SignUpAndEmail1792389446763 implements MigrationInterface {
  name = 'SignUpAndEmail1792389446763';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sms_codes" RENAME TO "verification_codes"`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE "sms_codes_id_seq" RENAME TO "verification_codes_id_seq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME CONSTRAINT "PK_sms_codes" TO "PK_18741b6b8bf1680dbf5057421d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME CONSTRAINT "FK_7d8cc5e61db9ec0f9842c8a0b1e" TO "FK_0a53c41a810420ee446082ce6c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME COLUMN "phone_index" TO "target_index"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" ADD "sent" boolean`,
    );
    await queryRunner.query(
      `UPDATE "verification_codes" SET "sent" = "user_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" ALTER COLUMN "sent" SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "ix_sms_codes_phone"`);
    await queryRunner.query(
      `CREATE INDEX "ix_verification_codes_target" ON "verification_codes" ("purpose", "target_index", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_details" ADD "email_enc" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_index" character(64)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_email_index" ON "users" ("email_index")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_users_email_index"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_index"`);
    await queryRunner.query(
      `ALTER TABLE "personal_details" DROP COLUMN "email_enc"`,
    );
    // Codes that only make sense here go: email codes and sign-up codes.
    await queryRunner.query(
      `DELETE FROM "verification_codes" WHERE "purpose" IN ('email', 'sign-up')`,
    );
    await queryRunner.query(`DROP INDEX "ix_verification_codes_target"`);
    await queryRunner.query(
      `CREATE INDEX "ix_sms_codes_phone" ON "verification_codes" ("purpose", "target_index", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" DROP COLUMN "sent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME COLUMN "target_index" TO "phone_index"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME CONSTRAINT "FK_0a53c41a810420ee446082ce6c6" TO "FK_7d8cc5e61db9ec0f9842c8a0b1e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME CONSTRAINT "PK_18741b6b8bf1680dbf5057421d7" TO "PK_sms_codes"`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE "verification_codes_id_seq" RENAME TO "sms_codes_id_seq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" RENAME TO "sms_codes"`,
    );
  }
}
