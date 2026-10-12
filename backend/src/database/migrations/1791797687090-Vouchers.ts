import { MigrationInterface, QueryRunner } from 'typeorm';

export class Vouchers1791797687090 implements MigrationInterface {
  name = 'Vouchers1791797687090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "voucher_sale_batches" ("sale_id" bigint NOT NULL, "batch_id" uuid NOT NULL, "position" smallint NOT NULL, CONSTRAINT "PK_c8dca0502ed124cdd45d9222402" PRIMARY KEY ("sale_id", "batch_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_voucher_sale_batches_batch" ON "voucher_sale_batches"  ("batch_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "input_batches" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "supplier_id" uuid NOT NULL, "input_type_code" character varying(31) NOT NULL, "lot_number" character varying(64) NOT NULL, "quantity" bigint, "manufacturer" character varying(120), "produced_on" date NOT NULL, "expires_on" date, "notes" character varying(500), "details_hash" character(66) NOT NULL, "status" character varying(10) NOT NULL, "registered_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_input_batches_dates" CHECK ("expires_on" IS NULL OR "expires_on" >= "produced_on"), CONSTRAINT "ck_input_batches_status" CHECK ("status" IN ('submitted', 'registered')), CONSTRAINT "PK_ab6030410a82aa1fe8f530e89d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_input_batches_lot" ON "input_batches"  ("supplier_id", "input_type_code", "lot_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vouchers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "project_id" uuid NOT NULL, "farmer_id" uuid NOT NULL, "input_type_code" character varying(31) NOT NULL, "quantity" bigint NOT NULL, "unit_price" bigint NOT NULL, "value" bigint NOT NULL, "spent_quantity" bigint NOT NULL DEFAULT '0', "held_quantity" bigint NOT NULL DEFAULT '0', "status" character varying(10) NOT NULL, "proposed_by_id" uuid NOT NULL, "proposed_at" TIMESTAMP WITH TIME ZONE, "last_activity_at" TIMESTAMP WITH TIME ZONE, "inactivity_limit_days" integer, "voided_amount" bigint, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', CONSTRAINT "ck_vouchers_inactivity" CHECK ("inactivity_limit_days" IS NULL OR "inactivity_limit_days" BETWEEN 1 AND 3650), CONSTRAINT "ck_vouchers_balance" CHECK ("spent_quantity" >= 0 AND "held_quantity" >= 0 AND "spent_quantity" + "held_quantity" <= "quantity"), CONSTRAINT "ck_vouchers_amounts" CHECK ("quantity" > 0 AND "unit_price" > 0 AND "value" = "quantity" * "unit_price"), CONSTRAINT "ck_vouchers_status" CHECK ("status" IN ('submitted', 'proposed', 'active', 'rejected', 'cancelled')), CONSTRAINT "PK_ed1b7dd909a696560763acdbc04" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vouchers_status_activity" ON "vouchers"  ("status", "last_activity_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vouchers_farmer" ON "vouchers"  ("farmer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vouchers_project" ON "vouchers"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "voucher_sales" ("id" bigint NOT NULL, "voucher_id" uuid NOT NULL, "supplier_id" uuid NOT NULL, "quantity" bigint NOT NULL, "amount" bigint NOT NULL, "status" character varying(10), "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "confirmed_by_id" uuid, "closed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_voucher_sales_amounts" CHECK ("quantity" > 0 AND "amount" > 0), CONSTRAINT "ck_voucher_sales_status" CHECK ("status" IS NULL OR "status" IN ('pending', 'confirmed', 'cancelled', 'expired')), CONSTRAINT "PK_4bf4def5e24f050e6aa4366e470" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_voucher_sales_supplier" ON "voucher_sales"  ("supplier_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_voucher_sales_voucher" ON "voucher_sales"  ("voucher_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_voucher_sales_status_expiry" ON "voucher_sales"  ("status", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "voucher_suppliers" ("voucher_id" uuid NOT NULL, "supplier_id" uuid NOT NULL, "position" smallint NOT NULL, CONSTRAINT "PK_96ef8b3dce8b3ff6c148b2a349e" PRIMARY KEY ("voucher_id", "supplier_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_voucher_suppliers_supplier" ON "voucher_suppliers"  ("supplier_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "input_batches" ADD CONSTRAINT "FK_ad5a2a5a5feb8ca1ce16d8260cb" FOREIGN KEY ("supplier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_batches" ADD CONSTRAINT "FK_e143fb38f7525a428c9662b7cca" FOREIGN KEY ("input_type_code") REFERENCES "input_types"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers" ADD CONSTRAINT "FK_6aaa14387ac6391c8c3e5d15121" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers" ADD CONSTRAINT "FK_4a13e1f52ddcf7c918bdca269f7" FOREIGN KEY ("farmer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers" ADD CONSTRAINT "FK_cb8a231b3868c5817ba1fd146bd" FOREIGN KEY ("input_type_code") REFERENCES "input_types"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "voucher_sales" ADD CONSTRAINT "FK_9baaf16b8b78d50506fa985a439" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voucher_sales" DROP CONSTRAINT "FK_9baaf16b8b78d50506fa985a439"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers" DROP CONSTRAINT "FK_cb8a231b3868c5817ba1fd146bd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers" DROP CONSTRAINT "FK_4a13e1f52ddcf7c918bdca269f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers" DROP CONSTRAINT "FK_6aaa14387ac6391c8c3e5d15121"`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_batches" DROP CONSTRAINT "FK_e143fb38f7525a428c9662b7cca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "input_batches" DROP CONSTRAINT "FK_ad5a2a5a5feb8ca1ce16d8260cb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_voucher_suppliers_supplier"`,
    );
    await queryRunner.query(`DROP TABLE "voucher_suppliers"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_voucher_sales_status_expiry"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_voucher_sales_voucher"`);
    await queryRunner.query(`DROP INDEX "public"."ix_voucher_sales_supplier"`);
    await queryRunner.query(`DROP TABLE "voucher_sales"`);
    await queryRunner.query(`DROP INDEX "public"."ix_vouchers_project"`);
    await queryRunner.query(`DROP INDEX "public"."ix_vouchers_farmer"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_vouchers_status_activity"`,
    );
    await queryRunner.query(`DROP TABLE "vouchers"`);
    await queryRunner.query(`DROP INDEX "public"."uq_input_batches_lot"`);
    await queryRunner.query(`DROP TABLE "input_batches"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_voucher_sale_batches_batch"`,
    );
    await queryRunner.query(`DROP TABLE "voucher_sale_batches"`);
  }
}
