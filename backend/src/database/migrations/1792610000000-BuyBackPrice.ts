import { MigrationInterface, QueryRunner } from 'typeorm';

export class BuyBackPrice1792610000000 implements MigrationInterface {
  name = 'BuyBackPrice1792610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" ADD "buy_back_unit_price" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" ADD "buy_back_quantity" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" ADD "buy_back_amount" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" ADD "bought_back_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" ADD CONSTRAINT "ck_warehouse_receipts_buy_back" CHECK (("buy_back_unit_price" IS NULL) = ("buy_back_amount" IS NULL) AND ("buy_back_unit_price" IS NULL) = ("buy_back_quantity" IS NULL) AND ("buy_back_unit_price" IS NULL OR ("buy_back_unit_price" > 0 AND "buy_back_quantity" > 0 AND "buy_back_amount" = "buy_back_unit_price" * "buy_back_quantity")))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" DROP CONSTRAINT "ck_warehouse_receipts_buy_back"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" DROP COLUMN "bought_back_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" DROP COLUMN "buy_back_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" DROP COLUMN "buy_back_quantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" DROP COLUMN "buy_back_unit_price"`,
    );
  }
}
