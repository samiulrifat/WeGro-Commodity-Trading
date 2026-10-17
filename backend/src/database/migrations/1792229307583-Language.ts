import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Each person's language (null until chosen), and notification values, so
 * the app can show every notification in its reader's language. Both columns
 * are new and nullable: no existing row changes.
 */
export class Language1792229307583 implements MigrationInterface {
  name = 'Language1792229307583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "language" character varying(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "ck_users_language" CHECK ("language" IN ('en', 'bn'))`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" ADD "params" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "params"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "ck_users_language"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "language"`);
  }
}
