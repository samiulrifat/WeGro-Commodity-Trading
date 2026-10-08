import { snakeCase, SnakeNamingStrategy } from './snake-naming.strategy';

describe('SnakeNamingStrategy', () => {
  const s = new SnakeNamingStrategy();

  it('converts names to snake_case', () => {
    expect(snakeCase('projectId')).toBe('project_id');
    expect(snakeCase('FieldRecord')).toBe('field_record');
    expect(snakeCase('paymentRefHash')).toBe('payment_ref_hash');
    expect(snakeCase('HTTPStatus')).toBe('http_status');
  });

  it('names tables and columns, keeping explicit names', () => {
    expect(s.tableName('WarehouseReceipt', undefined)).toBe(
      'warehouse_receipt',
    );
    expect(s.tableName('WarehouseReceipt', 'receipts')).toBe('receipts');
    expect(s.columnName('createdAt', undefined as unknown as string, [])).toBe(
      'created_at',
    );
    expect(
      s.columnName('city', undefined as unknown as string, ['homeAddress']),
    ).toBe('home_address_city');
    expect(s.columnName('x', 'custom_x', [])).toBe('custom_x');
  });

  it('names relations and join columns', () => {
    expect(s.relationName('fieldOfficer')).toBe('field_officer');
    expect(s.joinColumnName('fieldOfficer', 'id')).toBe('field_officer_id');
    expect(s.joinTableName('project', 'investor', 'investors')).toBe(
      'project_investors_investor',
    );
    expect(s.joinTableColumnName('project', 'id')).toBe('project_id');
  });
});
