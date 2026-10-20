import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revoking a verified person's access (they left, were dismissed...): when,
 * why and by whom, apart from a registration turned down.
 */

export class AccessRevocation1792490000000 implements MigrationInterface {
  name = 'AccessRevocation1792490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "access_revoked_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "revocation_reason" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "access_revoked_by_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "access_revoked_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "revocation_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "access_revoked_at"`,
    );
  }
}
