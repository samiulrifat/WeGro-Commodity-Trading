import { getMetadataArgsStorage } from 'typeorm';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { FieldRecordType } from '../modules/catalog/entities/field-record-type.entity';
import { FieldRecord } from '../modules/field-records/entities/field-record.entity';
import { InsuranceClaim } from '../modules/insurance/entities/insurance-claim.entity';
import { ListingDetails } from '../modules/trade/entities/listing-details.entity';

/**
 * Columns whose default is an SQL expression: what the database fills in
 * when a row leaves them out. The migrations hold the same defaults; this
 * keeps the entities saying so.
 */
describe('column defaults', () => {
  const defaults = (target: object) =>
    Object.fromEntries(
      getMetadataArgsStorage()
        .columns.filter(
          (c) => c.target === target && typeof c.options.default === 'function',
        )
        .map((c) => [c.propertyName, (c.options.default as () => string)()]),
    );

  it('stamps the time a row is written', () => {
    expect(defaults(AuditLog)).toMatchObject({ at: 'now()' });
    expect(defaults(ListingDetails)).toMatchObject({ createdAt: 'now()' });
  });

  it('starts lists and objects empty, never null', () => {
    expect(defaults(AuditLog)).toMatchObject({ params: "'{}'" });
    expect(defaults(FieldRecordType)).toEqual({ measurements: "'[]'" });
    expect(defaults(FieldRecord)).toEqual({ measurements: "'{}'" });
    expect(defaults(InsuranceClaim)).toEqual({ photoIds: "'{}'" });
  });
});
