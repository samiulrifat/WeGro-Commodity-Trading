import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtraRoles1792590000000 implements MigrationInterface {
  name = 'ExtraRoles1792590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "extra_roles" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "ck_users_extra_roles" CHECK ("extra_roles" <@ ARRAY['investor', 'buyer', 'seller']::text[])`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "ck_users_extra_roles"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "extra_roles"`);
  }
}
