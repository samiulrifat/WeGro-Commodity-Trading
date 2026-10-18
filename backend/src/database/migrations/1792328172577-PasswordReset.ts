import { MigrationInterface, QueryRunner } from 'typeorm';

/** Password reset codes sent by SMS (only their keyed hash is stored). */
export class PasswordReset1792328172577 implements MigrationInterface {
  name = 'PasswordReset1792328172577';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_reset_codes" ("id" BIGSERIAL NOT NULL, "phone_index" character(64) NOT NULL, "user_id" uuid, "code_hash" character(64) NOT NULL, "attempts" integer NOT NULL DEFAULT 0, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_password_reset_codes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_password_reset_codes_phone" ON "password_reset_codes" ("phone_index", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_codes" ADD CONSTRAINT "FK_password_reset_codes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_reset_codes"`);
  }
}
