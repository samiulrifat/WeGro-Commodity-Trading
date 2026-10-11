import { MigrationInterface, QueryRunner } from 'typeorm';

export class BlockchainFoundation1791693917468 implements MigrationInterface {
  name = 'BlockchainFoundation1791693917468';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chain_event" ("id" BIGSERIAL NOT NULL, "block_number" bigint NOT NULL, "block_hash" character(66) NOT NULL, "block_time" TIMESTAMP WITH TIME ZONE NOT NULL, "tx_hash" character(66) NOT NULL, "log_index" integer NOT NULL, "contract" character varying(32) NOT NULL, "address" character(42) NOT NULL, "event_name" character varying(64) NOT NULL, "args" jsonb NOT NULL, "indexed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_chain_event_position" UNIQUE ("block_number", "log_index"), CONSTRAINT "PK_bf9ed42a9e16d2f12d0d4cd8b76" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_chain_event_tx_hash" ON "chain_event"  ("tx_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_chain_event_contract_event" ON "chain_event"  ("contract", "event_name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "indexer_state" ("id" character varying(32) NOT NULL, "last_block" bigint NOT NULL, "last_block_hash" character(66) NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_186a04c706e20d425992635168a" PRIMARY KEY ("id"))`,
    );
    // Custodial key indexes for new users. Index 0 is the platform operator.
    await queryRunner.query(
      `CREATE SEQUENCE "signer_key_index_seq" AS integer START 1 MINVALUE 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE "signer_key_index_seq"`);
    await queryRunner.query(`DROP TABLE "indexer_state"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_chain_event_contract_event"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_chain_event_tx_hash"`);
    await queryRunner.query(`DROP TABLE "chain_event"`);
  }
}
