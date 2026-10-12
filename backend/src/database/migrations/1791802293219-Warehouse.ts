import { MigrationInterface, QueryRunner } from 'typeorm';

export class Warehouse1791802293219 implements MigrationInterface {
  name = 'Warehouse1791802293219';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "receipt_rechecks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "receipt_id" character(66) NOT NULL, "checked_on" date NOT NULL, "new_expires_on" date NOT NULL, "bag_count" integer, "moisture_percent" numeric(4,1), "storage_bay" character varying(40), "notes" character varying(1000), "recheck_hash" character(66) NOT NULL, "status" character varying(10) NOT NULL, "checked_by_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_receipt_rechecks_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "PK_7c2bf64da230fa309e5392fc952" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_receipt_rechecks_hash" ON "receipt_rechecks"  ("recheck_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_receipt_rechecks_receipt" ON "receipt_rechecks"  ("receipt_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouse_operators" ("operator_id" uuid NOT NULL, "site_id" uuid, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b534dfbfcc28d12f284a2a3776c" PRIMARY KEY ("operator_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_operators_site" ON "warehouse_operators"  ("site_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouse_receipts" ("id" character(66) NOT NULL, "project_id" uuid NOT NULL, "site_id" uuid NOT NULL, "owner_id" uuid, "owner_is_wegro" boolean NOT NULL DEFAULT false, "pending_to_wegro" boolean NOT NULL DEFAULT false, "produce_code" character varying(31) NOT NULL, "quantity" bigint NOT NULL, "original_quantity" bigint NOT NULL, "status" character varying(20) NOT NULL, "parent_id" character(66), "bag_count" integer, "moisture_percent" numeric(4,1), "storage_bay" character varying(40), "intake_date" date NOT NULL, "notes" character varying(1000), "details_hash" character(66) NOT NULL, "expires_on" date NOT NULL, "issued_by_id" uuid, "issued_at" TIMESTAMP WITH TIME ZONE, "collected_at" TIMESTAMP WITH TIME ZONE, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_warehouse_receipts_quantity" CHECK ("quantity" >= 0 AND "quantity" <= "original_quantity" AND ("quantity" > 0 OR "status" = 'sold_out')), CONSTRAINT "ck_warehouse_receipts_owner" CHECK (("owner_id" IS NULL) = "owner_is_wegro"), CONSTRAINT "ck_warehouse_receipts_status" CHECK ("status" IN ('submitted', 'issued', 'pending_handover', 'listed', 'sold', 'collected', 'sold_out')), CONSTRAINT "PK_10bc34b8a5d29a0affe909a57b8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_receipts_parent" ON "warehouse_receipts"  ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_receipts_owner" ON "warehouse_receipts"  ("owner_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_receipts_site_status" ON "warehouse_receipts"  ("site_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_warehouse_receipts_project" ON "warehouse_receipts"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouse_sites" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "district_code" character varying(20) NOT NULL, "address" character varying(300) NOT NULL, "storage_type" character varying(16) NOT NULL, "capacity_kg" bigint, "details_hash" character(66) NOT NULL, "status" character varying(10) NOT NULL, "created_by_id" uuid NOT NULL, CONSTRAINT "ck_warehouse_sites_capacity" CHECK ("capacity_kg" IS NULL OR "capacity_kg" > 0), CONSTRAINT "ck_warehouse_sites_type" CHECK ("storage_type" IN ('warehouse', 'cold_storage')), CONSTRAINT "ck_warehouse_sites_status" CHECK ("status" IN ('submitted', 'registered')), CONSTRAINT "PK_218fb1737b4034f24d9d7c0ed43" PRIMARY KEY ("id"))`,
    );
    // Hand-written: site names are unique regardless of case.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_warehouse_sites_name" ON "warehouse_sites" (lower("name"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_warehouse_sites_name"`);
    await queryRunner.query(`DROP TABLE "warehouse_sites"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_receipts_project"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_receipts_site_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_receipts_owner"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_receipts_parent"`,
    );
    await queryRunner.query(`DROP TABLE "warehouse_receipts"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_warehouse_operators_site"`,
    );
    await queryRunner.query(`DROP TABLE "warehouse_operators"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_receipt_rechecks_receipt"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_receipt_rechecks_hash"`);
    await queryRunner.query(`DROP TABLE "receipt_rechecks"`);
  }
}
