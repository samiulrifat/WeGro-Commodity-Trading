import { MigrationInterface, QueryRunner } from 'typeorm';

export class WarehouseSiteClose1792530000000 implements MigrationInterface {
  name = 'WarehouseSiteClose1792530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouse_sites" ADD "closed" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_sites" ADD "closed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouse_sites" DROP COLUMN "closed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_sites" DROP COLUMN "closed"`,
    );
  }
}
