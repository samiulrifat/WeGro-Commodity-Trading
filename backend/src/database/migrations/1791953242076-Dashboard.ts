import { MigrationInterface, QueryRunner } from 'typeorm';

export class Dashboard1791953242076 implements MigrationInterface {
  name = 'Dashboard1791953242076';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" ADD "handover_offered_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_users_pending" ON "users"  ("created_at") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_accounts_pending" ON "bank_accounts"  ("created_at") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_active" ON "projects"  ("activated_at") WHERE "stage" = 'active'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_open" ON "projects"  ("published_at") WHERE "stage" = 'open_for_funding'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_insurance_claims_open" ON "insurance_claims"  ("opened_at") WHERE "status" IN ('triggered', 'under_review')`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_settlement_rounds_prepared" ON "settlement_rounds"  ("prepared_at") WHERE "status" = 'prepared'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_offers_paid" ON "offers"  ("paid_at") WHERE "status" = 'paid'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_offers_pending" ON "offers"  ("made_at") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vouchers_inactivity" ON "vouchers"  ("last_activity_at") WHERE "status" = 'active' AND "inactivity_limit_days" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vouchers_proposed" ON "vouchers"  ("proposed_at") WHERE "status" = 'proposed'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_receipts_handover" ON "warehouse_receipts"  ("handover_offered_at") WHERE "status" = 'pending_handover'`,
    );
    // Hand-written: buy-backs already waiting get their offer time from the indexed events.
    await queryRunner.query(
      `UPDATE "warehouse_receipts" r SET "handover_offered_at" = e.at
         FROM (SELECT args->>'receiptId' AS receipt_id, MAX(block_time) AS at FROM "chain_event"
                WHERE contract = 'WarehouseReceipt' AND event_name = 'HandoverOffered' GROUP BY 1) e
        WHERE r.status = 'pending_handover' AND r.id = e.receipt_id`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_receipts_handover"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_vouchers_proposed"`);
    await queryRunner.query(`DROP INDEX "public"."ix_vouchers_inactivity"`);
    await queryRunner.query(`DROP INDEX "public"."ix_offers_pending"`);
    await queryRunner.query(`DROP INDEX "public"."ix_offers_paid"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_settlement_rounds_prepared"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_insurance_claims_open"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_open"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_active"`);
    await queryRunner.query(`DROP INDEX "public"."ix_bank_accounts_pending"`);
    await queryRunner.query(`DROP INDEX "public"."ix_users_pending"`);
    await queryRunner.query(
      `ALTER TABLE "warehouse_receipts" DROP COLUMN "handover_offered_at"`,
    );
  }
}
