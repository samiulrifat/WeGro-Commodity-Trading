import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExternalSellers1792540000000 implements MigrationInterface {
  name = 'ExternalSellers1792540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "listing_details" ("id" uuid NOT NULL, "seller_id" uuid NOT NULL, "produce_code" character varying(31) NOT NULL, "quantity" bigint NOT NULL, "asking_unit_price" bigint NOT NULL, "district_code" character varying(20) NOT NULL, "description" character varying(1000), "photos" jsonb NOT NULL, "details_hash" character(66) NOT NULL, "listing_id" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_listing_details_amounts" CHECK ("quantity" > 0 AND "asking_unit_price" > 0), CONSTRAINT "PK_5b21b778d249ef6074911513b0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listing_details_seller" ON "listing_details"  ("seller_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_listing_details_listing" ON "listing_details"  ("listing_id") WHERE "listing_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_listing_details_hash" ON "listing_details"  ("details_hash") `,
    );
    await queryRunner.query(`ALTER TABLE "listings" ADD "details_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "listings" ADD "decided_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD "reject_reason" character varying(500)`,
    );
    await queryRunner.query(`ALTER TABLE "offers" ADD "buyer_fee" bigint`);
    await queryRunner.query(`ALTER TABLE "offers" ADD "seller_fee" bigint`);
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "seller_payout_ref_enc" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "seller_payout_ref_hash" character(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "seller_paid_by_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD "seller_paid_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "FK_9cb7b651aa11eaf155bdb5dbd07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "project_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "farmer_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_offers_delivered" ON "offers"  ("delivered_at") WHERE "status" = 'delivered'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_offers_seller_payout_ref" ON "offers"  ("seller_payout_ref_hash") WHERE "seller_payout_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "ck_listings_external" CHECK (("project_id" IS NULL) = ("farmer_id" IS NULL) AND ("project_id" IS NOT NULL OR "seller_id" IS NOT NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "ck_offers_fees" CHECK (("buyer_fee" IS NULL OR "buyer_fee" >= 0) AND ("seller_fee" IS NULL OR "seller_fee" >= 0))`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "FK_9cb7b651aa11eaf155bdb5dbd07" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "offers" ALTER COLUMN "status" TYPE character varying(12)`,
    );
    // New statuses: an outside seller's listing waits for, or is turned down
    // by, an admin; their deal ends with the seller paid.
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "ck_listings_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "ck_listings_status" CHECK ("status" IS NULL OR "status" IN ('open', 'cancelled', 'sold_out', 'pending', 'rejected'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "ck_offers_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "ck_offers_status" CHECK ("status" IS NULL OR "status" IN ('pending', 'withdrawn', 'rejected', 'approved', 'cancelled', 'expired', 'paid', 'delivered', 'seller_paid'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "offers" ALTER COLUMN "status" TYPE character varying(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "ck_offers_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "ck_offers_status" CHECK ("status" IS NULL OR "status" IN ('pending', 'withdrawn', 'rejected', 'approved', 'cancelled', 'expired', 'paid', 'delivered'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "ck_listings_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "ck_listings_status" CHECK ("status" IS NULL OR "status" IN ('open', 'cancelled', 'sold_out'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "FK_9cb7b651aa11eaf155bdb5dbd07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "ck_offers_fees"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "ck_listings_external"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_offers_seller_payout_ref"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_offers_delivered"`);
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "farmer_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "project_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "FK_9cb7b651aa11eaf155bdb5dbd07" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "seller_paid_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "seller_paid_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "seller_payout_ref_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN "seller_payout_ref_enc"`,
    );
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN "seller_fee"`);
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN "buyer_fee"`);
    await queryRunner.query(
      `ALTER TABLE "listings" DROP COLUMN "reject_reason"`,
    );
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "decided_at"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "details_id"`);
    await queryRunner.query(`DROP INDEX "public"."uq_listing_details_hash"`);
    await queryRunner.query(`DROP INDEX "public"."uq_listing_details_listing"`);
    await queryRunner.query(`DROP INDEX "public"."ix_listing_details_seller"`);
    await queryRunner.query(`DROP TABLE "listing_details"`);
  }
}
