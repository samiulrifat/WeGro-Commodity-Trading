import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmUpdateLists1792520000000 implements MigrationInterface {
  name = 'FarmUpdateLists1792520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "ix_field_records_observed" ON "field_records"  ("observed_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_field_records_recorder_observed" ON "field_records"  ("recorded_by_id", "observed_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_field_records_recorder_observed"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_field_records_observed"`);
  }
}
