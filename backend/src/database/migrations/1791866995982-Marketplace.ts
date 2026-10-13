import { MigrationInterface, QueryRunner } from 'typeorm';

export class Marketplace1791866995982 implements MigrationInterface {
  name = 'Marketplace1791866995982';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "buyer_requests" ("id" bigint NOT NULL, "buyer_id" uuid NOT NULL, "produce_code" character varying(31) NOT NULL, "quantity" bigint NOT NULL, "max_unit_price" bigint NOT NULL, "valid_until" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(10), "posted_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_buyer_requests_amounts" CHECK ("quantity" > 0 AND "max_unit_price" > 0), CONSTRAINT "ck_buyer_requests_status" CHECK ("status" IS NULL OR "status" IN ('open', 'cancelled')), CONSTRAINT "PK_2ce35a627504947914880113889" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_buyer_requests_buyer" ON "buyer_requests"  ("buyer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_buyer_requests_status_produce" ON "buyer_requests"  ("status", "produce_code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "deliveries" ("offer_id" bigint NOT NULL, "side" character varying(8) NOT NULL, "quantity" bigint NOT NULL, "notes" character varying(1000), "photo_id" uuid, "photo_hash" character(66), "quality_hash" character(66) NOT NULL, "confirmed_by_id" uuid, "status" character varying(10) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_deliveries_quantity" CHECK ("quantity" > 0), CONSTRAINT "ck_deliveries_status" CHECK ("status" IN ('submitted', 'recorded')), CONSTRAINT "ck_deliveries_side" CHECK ("side" IN ('buyer', 'handler')), CONSTRAINT "PK_990aed52025958f537f0627b373" PRIMARY KEY ("offer_id", "side"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "listings" ("id" bigint NOT NULL, "project_id" uuid NOT NULL, "farmer_id" uuid NOT NULL, "receipt_id" character(66), "seller_is_wegro" boolean NOT NULL, "seller_id" uuid, "produce_code" character varying(31) NOT NULL, "quantity" bigint NOT NULL, "available" bigint NOT NULL, "asking_unit_price" bigint NOT NULL, "unpaid_deals" integer NOT NULL DEFAULT '0', "status" character varying(10), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_listings_amounts" CHECK ("quantity" > 0 AND "asking_unit_price" > 0 AND "available" BETWEEN 0 AND "quantity" AND "unpaid_deals" >= 0), CONSTRAINT "ck_listings_seller" CHECK (("seller_id" IS NULL) = "seller_is_wegro"), CONSTRAINT "ck_listings_status" CHECK ("status" IS NULL OR "status" IN ('open', 'cancelled', 'sold_out')), CONSTRAINT "PK_520ecac6c99ec90bcf5a603cdcb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_receipt" ON "listings"  ("receipt_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_project" ON "listings"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_status_produce" ON "listings"  ("status", "produce_code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "offers" ("id" bigint NOT NULL, "listing_id" bigint NOT NULL, "buyer_id" uuid NOT NULL, "quantity" bigint NOT NULL, "unit_price" bigint NOT NULL, "status" character varying(10), "made_at" TIMESTAMP WITH TIME ZONE NOT NULL, "payment_due_at" TIMESTAMP WITH TIME ZONE, "decided_at" TIMESTAMP WITH TIME ZONE, "payment_ref_enc" text, "payment_ref_hash" character(66), "paid_confirmed_by_id" uuid, "paid_at" TIMESTAMP WITH TIME ZONE, "receipt_part_id" character(66), "delivered_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_offers_amounts" CHECK ("quantity" > 0 AND "unit_price" > 0), CONSTRAINT "ck_offers_status" CHECK ("status" IS NULL OR "status" IN ('pending', 'withdrawn', 'rejected', 'approved', 'cancelled', 'expired', 'paid', 'delivered')), CONSTRAINT "PK_4c88e956195bba85977da21b8f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_offers_payment_ref" ON "offers"  ("payment_ref_hash") WHERE "payment_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_offers_status_due" ON "offers"  ("status", "payment_due_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_offers_buyer" ON "offers"  ("buyer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_offers_listing_status" ON "offers"  ("listing_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "FK_9cb7b651aa11eaf155bdb5dbd07" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "FK_ff1371fdb408ba33d5d08a61629" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "FK_ff1371fdb408ba33d5d08a61629"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "FK_9cb7b651aa11eaf155bdb5dbd07"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_offers_listing_status"`);
    await queryRunner.query(`DROP INDEX "public"."ix_offers_buyer"`);
    await queryRunner.query(`DROP INDEX "public"."ix_offers_status_due"`);
    await queryRunner.query(`DROP INDEX "public"."uq_offers_payment_ref"`);
    await queryRunner.query(`DROP TABLE "offers"`);
    await queryRunner.query(`DROP INDEX "public"."ix_listings_status_produce"`);
    await queryRunner.query(`DROP INDEX "public"."ix_listings_project"`);
    await queryRunner.query(`DROP INDEX "public"."ix_listings_receipt"`);
    await queryRunner.query(`DROP TABLE "listings"`);
    await queryRunner.query(`DROP TABLE "deliveries"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_buyer_requests_status_produce"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_buyer_requests_buyer"`);
    await queryRunner.query(`DROP TABLE "buyer_requests"`);
  }
}
