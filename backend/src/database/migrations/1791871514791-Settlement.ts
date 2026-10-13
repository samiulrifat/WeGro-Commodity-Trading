import { MigrationInterface, QueryRunner } from 'typeorm';

export class Settlement1791871514791 implements MigrationInterface {
  name = 'Settlement1791871514791';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bank_accounts" ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "details_enc" text NOT NULL, "status" character varying(10) NOT NULL, "entered_by_id" uuid NOT NULL, "decided_by_id" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_bank_accounts_status" CHECK ("status" IN ('pending', 'verified', 'rejected', 'superseded')), CONSTRAINT "PK_c872de764f2038224a013ff25ed" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_bank_accounts_verified" ON "bank_accounts"  ("user_id") WHERE "status" = 'verified'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_bank_accounts_pending" ON "bank_accounts"  ("user_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bank_accounts_user" ON "bank_accounts"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payout_lines" ("round_id" bigint NOT NULL, "payee_id" uuid NOT NULL, "payee_role" character varying(10), "slots" integer, "amount" bigint, "line_hash" character(66) NOT NULL, "verified" boolean NOT NULL DEFAULT false, "payment_ref_enc" text, "payment_ref_hash" character(66), "recorded_by_id" uuid, "paid_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_payout_lines_paid" CHECK ("paid_at" IS NULL OR "payment_ref_hash" IS NOT NULL), CONSTRAINT "ck_payout_lines_amount" CHECK ("amount" IS NULL OR "amount" > 0), CONSTRAINT "ck_payout_lines_role" CHECK ("payee_role" IS NULL OR "payee_role" IN ('farmer', 'investor')), CONSTRAINT "PK_6bfbf394877cbd778a13f320650" PRIMARY KEY ("round_id", "payee_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payout_lines_payment_ref" ON "payout_lines"  ("payment_ref_hash") WHERE "payment_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payout_lines_payee" ON "payout_lines"  ("payee_id", "round_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_costs" ("id" uuid NOT NULL, "cost_id" bigint, "project_id" uuid NOT NULL, "category" character varying(12) NOT NULL, "amount" bigint NOT NULL, "incurred_on" date NOT NULL, "note" character varying(1000) NOT NULL, "photo_id" uuid, "details_hash" character(66) NOT NULL, "entered_by_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE, "voided_by_id" uuid, "voided_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_project_costs_amount" CHECK ("amount" > 0), CONSTRAINT "ck_project_costs_category" CHECK ("category" IN ('transport', 'labour', 'irrigation', 'storage', 'services', 'other')), CONSTRAINT "ck_project_costs_status" CHECK ("status" IN ('submitted', 'recorded', 'voided')), CONSTRAINT "PK_73a304925bcbd2c97ca3177d81a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_costs_cost_id" ON "project_costs"  ("cost_id") WHERE "cost_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_costs_details" ON "project_costs"  ("details_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_project_costs_project" ON "project_costs"  ("project_id", "incurred_on") `,
    );
    await queryRunner.query(
      `CREATE TABLE "settlement_rounds" ("id" bigint NOT NULL, "project_id" uuid NOT NULL, "is_final" boolean NOT NULL, "status" character varying(10), "income" bigint NOT NULL, "costs" bigint NOT NULL, "profit" bigint NOT NULL, "farmer_share" bigint NOT NULL, "investor_share" bigint NOT NULL, "wegro_share" bigint NOT NULL, "capital_return" bigint NOT NULL, "leftover" bigint NOT NULL, "fingerprint" character(66) NOT NULL, "verified" boolean NOT NULL, "prepared_by_id" uuid NOT NULL, "prepared_at" TIMESTAMP WITH TIME ZONE NOT NULL, "approved_by_id" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "reject_reason" character varying(1000), "reject_reason_hash" character(66), "rejected_by_id" uuid, "rejected_at" TIMESTAMP WITH TIME ZONE, "payee_count" integer NOT NULL, "paid_count" integer NOT NULL DEFAULT '0', "paid_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_settlement_rounds_split" CHECK ("farmer_share" + "investor_share" + "wegro_share" <= "profit" AND "paid_count" <= "payee_count"), CONSTRAINT "ck_settlement_rounds_status" CHECK ("status" IS NULL OR "status" IN ('prepared', 'approved', 'rejected', 'paid')), CONSTRAINT "PK_4489a5bf4bd8df94f34d4f35b7b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_settlement_rounds_status" ON "settlement_rounds"  ("status", "approved_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_settlement_rounds_project" ON "settlement_rounds"  ("project_id", "id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_settlement_rounds_project"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_settlement_rounds_status"`,
    );
    await queryRunner.query(`DROP TABLE "settlement_rounds"`);
    await queryRunner.query(`DROP INDEX "public"."ix_project_costs_project"`);
    await queryRunner.query(`DROP INDEX "public"."uq_project_costs_details"`);
    await queryRunner.query(`DROP INDEX "public"."uq_project_costs_cost_id"`);
    await queryRunner.query(`DROP TABLE "project_costs"`);
    await queryRunner.query(`DROP INDEX "public"."ix_payout_lines_payee"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_payout_lines_payment_ref"`,
    );
    await queryRunner.query(`DROP TABLE "payout_lines"`);
    await queryRunner.query(`DROP INDEX "public"."ix_bank_accounts_user"`);
    await queryRunner.query(`DROP INDEX "public"."uq_bank_accounts_pending"`);
    await queryRunner.query(`DROP INDEX "public"."uq_bank_accounts_verified"`);
    await queryRunner.query(`DROP TABLE "bank_accounts"`);
  }
}
