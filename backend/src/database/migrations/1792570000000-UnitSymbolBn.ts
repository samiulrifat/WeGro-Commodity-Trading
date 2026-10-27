import { MigrationInterface, QueryRunner } from 'typeorm';

/** Units' symbols in Bengali ("কেজি" beside "kg"), for Bengali readers. */
export class UnitSymbolBn1792570000000 implements MigrationInterface {
  name = 'UnitSymbolBn1792570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "units" ADD "symbol_bn" character varying(12)`,
    );
    // The starting units; any added since keep their symbol until an editor
    // gives them a Bengali one.
    await queryRunner.query(
      `UPDATE "units" SET "symbol_bn" = CASE "code"
         WHEN 'KG' THEN 'কেজি' WHEN 'GRAM' THEN 'গ্রাম' WHEN 'LITRE' THEN 'লিটার'
         WHEN 'ML' THEN 'মি.লি.' WHEN 'PIECE' THEN 'পিস' ELSE "symbol" END`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "symbol_bn" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "units" DROP COLUMN "symbol_bn"`);
  }
}
