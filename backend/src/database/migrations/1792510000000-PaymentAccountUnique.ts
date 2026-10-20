import { MigrationInterface, QueryRunner } from 'typeorm';

/** One payment account per branch and number. */

export class PaymentAccountUnique1792510000000 implements MigrationInterface {
  name = 'PaymentAccountUnique1792510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payment_accounts_account" ON "payment_accounts"  ("routing_number", "account_number") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."uq_payment_accounts_account"`,
    );
  }
}
