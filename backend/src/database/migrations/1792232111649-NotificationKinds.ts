import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One notification kind per meaning, so the app can word each one: the
 * watchdog's single kind becomes one per problem, and Accounts' "confirm the
 * buyer's payment" leaves the buyer's "payment due" kind. Older rows are
 * renamed by their (fixed) English titles; nothing else changes.
 */
export class NotificationKinds1792232111649 implements MigrationInterface {
  name = 'NotificationKinds1792232111649';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "notifications" SET "kind" = CASE
         WHEN "title" LIKE 'Resolved:%' THEN 'system.resolved'
         WHEN "title" = 'The blockchain node cannot be reached' THEN 'system.node-unreachable'
         WHEN "title" = 'The database is falling behind the ledger' THEN 'system.indexer-behind'
         ELSE 'system.indexer-failing' END
       WHERE "kind" = 'system.indexer'`,
    );
    await queryRunner.query(
      `UPDATE "notifications" SET "kind" = 'deal.awaiting-payment'
       WHERE "kind" = 'deal.payment-due' AND "category" = 'action'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "notifications" SET "kind" = 'system.indexer' WHERE "kind" LIKE 'system.%'`,
    );
    await queryRunner.query(
      `UPDATE "notifications" SET "kind" = 'deal.payment-due' WHERE "kind" = 'deal.awaiting-payment'`,
    );
  }
}
