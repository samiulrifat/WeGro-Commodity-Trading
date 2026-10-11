import { MigrationInterface, QueryRunner } from 'typeorm';

export class Identity1791702598550 implements MigrationInterface {
  name = 'Identity1791702598550';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "personal_details" ("user_id" uuid NOT NULL, "full_name_enc" text NOT NULL, "phone_enc" text NOT NULL, "nid_enc" text, "date_of_birth_enc" text, "address_enc" text, "district" character varying(20), "nid_index" character(64), "details_hash" character(66), "id_check" jsonb, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_295d80a7843d86e907019017af8" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_personal_details_district" ON "personal_details"  ("district") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_personal_details_nid_index" ON "personal_details"  ("nid_index") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "role" character varying(20) NOT NULL, "status" character varying(10) NOT NULL, "chain_state" character varying(10) NOT NULL, "phone_index" character(64) NOT NULL, "password_hash" character varying(200) NOT NULL, "must_change_password" boolean NOT NULL DEFAULT false, "token_version" integer NOT NULL DEFAULT '0', "failed_login_count" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "key_index" integer NOT NULL, "pending_key_index" integer, "account" character(42) NOT NULL, "registered_by_id" uuid, "field_officer_id" uuid, "status_reason" character varying(300), "status_changed_at" TIMESTAMP WITH TIME ZONE, "registration_tx" character(66), "chain_event_block" bigint NOT NULL DEFAULT '-1', "chain_event_log" integer NOT NULL DEFAULT '-1', "is_demo" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_phone_index" ON "users"  ("phone_index") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_key_index" ON "users"  ("key_index") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_pending_key_index" ON "users"  ("pending_key_index") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_account" ON "users"  ("account") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_users_registered_by" ON "users"  ("registered_by_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_users_field_officer" ON "users"  ("field_officer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_single_super_admin" ON "users"  ("role") WHERE "role" = 'super_admin'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_users_role_status" ON "users"  ("role", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "family_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_tokens_user" ON "refresh_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_tokens_family" ON "refresh_tokens"  ("family_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_refresh_tokens_hash" ON "refresh_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_details" ADD CONSTRAINT "FK_295d80a7843d86e907019017af8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_b73184b1c50b1b5065fc171c586" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_89a84275246117bef695c49c0ec" FOREIGN KEY ("field_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_89a84275246117bef695c49c0ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_b73184b1c50b1b5065fc171c586"`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_details" DROP CONSTRAINT "FK_295d80a7843d86e907019017af8"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_refresh_tokens_hash"`);
    await queryRunner.query(`DROP INDEX "public"."ix_refresh_tokens_family"`);
    await queryRunner.query(`DROP INDEX "public"."ix_refresh_tokens_user"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."ix_users_role_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_users_single_super_admin"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_users_field_officer"`);
    await queryRunner.query(`DROP INDEX "public"."ix_users_registered_by"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_account"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_pending_key_index"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_key_index"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_phone_index"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_personal_details_nid_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_personal_details_district"`,
    );
    await queryRunner.query(`DROP TABLE "personal_details"`);
  }
}
