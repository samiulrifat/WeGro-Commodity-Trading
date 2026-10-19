import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Whole-word name search: each word of a person's name as a keyed hash
 * (names stay encrypted). Filled in for existing people at startup, since
 * the key is not available to migrations.
 */

export class NameIndex1792402586216 implements MigrationInterface {
  name = 'NameIndex1792402586216';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "person_name_tokens" ("user_id" uuid NOT NULL, "token_index" character(64) NOT NULL, CONSTRAINT "PK_03d5dccbf505e35e00d6f41cf49" PRIMARY KEY ("user_id", "token_index"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_person_name_tokens_token" ON "person_name_tokens"  ("token_index") `,
    );
    await queryRunner.query(
      `ALTER TABLE "person_name_tokens" ADD CONSTRAINT "FK_608125408209b3b538e1f0b407f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "person_name_tokens" DROP CONSTRAINT "FK_608125408209b3b538e1f0b407f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_person_name_tokens_token"`,
    );
    await queryRunner.query(`DROP TABLE "person_name_tokens"`);
  }
}
