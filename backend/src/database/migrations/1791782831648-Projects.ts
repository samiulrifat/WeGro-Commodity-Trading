import { MigrationInterface, QueryRunner } from 'typeorm';

export class Projects1791782831648 implements MigrationInterface {
  name = 'Projects1791782831648';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(120) NOT NULL, "description" character varying(2000), "produce_code" character varying(31) NOT NULL, "category" character varying(16) NOT NULL, "district_code" character varying(20) NOT NULL, "location" character varying(200) NOT NULL, "farmer_id" uuid NOT NULL, "duration_type" character varying(10) NOT NULL, "duration_months" smallint NOT NULL, "payout_interval_months" smallint NOT NULL DEFAULT '0', "funding_target" bigint NOT NULL, "slot_price" bigint NOT NULL, "total_slots" integer NOT NULL, "farmer_bps" smallint NOT NULL, "investor_bps" smallint NOT NULL, "wegro_bps" smallint NOT NULL, "insured" boolean NOT NULL DEFAULT false, "estimated_return_min_bps" integer NOT NULL, "estimated_return_max_bps" integer NOT NULL, "planned_start_date" date, "stage" character varying(20) NOT NULL, "chain_state" character varying(10) NOT NULL, "terms_hash" character(66), "issued_slots" integer NOT NULL DEFAULT '0', "reserved_slots" integer NOT NULL DEFAULT '0', "refund_total" bigint, "created_by_id" uuid NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE, "stage_changed_at" TIMESTAMP WITH TIME ZONE, "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', CONSTRAINT "ck_projects_estimate" CHECK ("estimated_return_min_bps" BETWEEN 0 AND "estimated_return_max_bps"), CONSTRAINT "ck_projects_slots" CHECK ("issued_slots" >= 0 AND "reserved_slots" >= 0 AND "issued_slots" + "reserved_slots" <= "total_slots"), CONSTRAINT "ck_projects_money" CHECK ("slot_price" > 0 AND "funding_target" > 0 AND "funding_target" % "slot_price" = 0), CONSTRAINT "ck_projects_split" CHECK ("farmer_bps" + "investor_bps" + "wegro_bps" = 10000), CONSTRAINT "ck_projects_category" CHECK ("category" IN ('storable_crop', 'spice', 'perishable')), CONSTRAINT "ck_projects_duration_type" CHECK ("duration_type" IN ('short_term', 'long_term')), CONSTRAINT "ck_projects_chain_state" CHECK ("chain_state" IN ('local', 'submitted', 'confirmed')), CONSTRAINT "ck_projects_stage" CHECK ("stage" IN ('draft', 'open_for_funding', 'funded', 'active', 'ready_for_sale', 'paid_out', 'closed', 'cancelled')), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_farmer" ON "projects"  ("farmer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_duration_type" ON "projects"  ("duration_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_district" ON "projects"  ("district_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_produce" ON "projects"  ("produce_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_stage" ON "projects"  ("stage") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refunds" ("project_id" uuid NOT NULL, "investor_id" uuid NOT NULL, "amount" bigint NOT NULL, "payment_ref_enc" text, "payment_ref_hash" character(66) NOT NULL, "confirmed" boolean NOT NULL DEFAULT false, "recorded_by_id" uuid, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_refunds_amount" CHECK ("amount" > 0), CONSTRAINT "PK_4d6d2011456d63c9b3d5c5914b1" PRIMARY KEY ("project_id", "investor_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_refunds_payment_ref" ON "refunds"  ("payment_ref_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reservations" ("id" bigint NOT NULL, "project_id" uuid NOT NULL, "investor_id" uuid NOT NULL, "slots" integer NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(10), "reserved_at" TIMESTAMP WITH TIME ZONE NOT NULL, "payment_ref_enc" text, "payment_ref_hash" character(66), "confirmed_by_id" uuid, "closed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_reservations_slots" CHECK ("slots" > 0), CONSTRAINT "ck_reservations_status" CHECK ("status" IS NULL OR "status" IN ('pending', 'confirmed', 'expired', 'cancelled')), CONSTRAINT "PK_da95cef71b617ac35dc5bcda243" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reservations_payment_ref" ON "reservations"  ("payment_ref_hash") WHERE "payment_ref_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reservations_investor" ON "reservations"  ("investor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reservations_project_status" ON "reservations"  ("project_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reservations_status_expiry" ON "reservations"  ("status", "expires_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "FK_4e98d11d4214331c0075da5ce1f" FOREIGN KEY ("produce_code") REFERENCES "produce_types"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "FK_3ce0edfb0232d2d8d3a484f46af" FOREIGN KEY ("farmer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_4db14455c54dd5ed5ceaba94fab" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_9319968299ad604d5844cb35e62" FOREIGN KEY ("investor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    // Hand-written: per-project ledger history (timelines, audit) by index, not by scanning events.
    await queryRunner.query(
      `CREATE INDEX "ix_chain_event_project_id" ON "chain_event" (("args"->>'projectId'), "block_number", "log_index") WHERE "args" ? 'projectId'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ix_chain_event_project_id"`);
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "FK_9319968299ad604d5844cb35e62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "FK_4db14455c54dd5ed5ceaba94fab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT "FK_3ce0edfb0232d2d8d3a484f46af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT "FK_4e98d11d4214331c0075da5ce1f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_reservations_status_expiry"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_reservations_project_status"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_reservations_investor"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_reservations_payment_ref"`,
    );
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP INDEX "public"."uq_refunds_payment_ref"`);
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_stage"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_produce"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_district"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_duration_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_projects_farmer"`);
    await queryRunner.query(`DROP TABLE "projects"`);
  }
}
