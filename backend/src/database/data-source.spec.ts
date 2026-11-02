import dataSource from './data-source';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** The TypeORM CLI's connection: the same database, entities and naming as the app. */
describe('migration data source', () => {
  it('reads every entity and migration, with snake_case names', () => {
    const o = dataSource.options as unknown as Record<string, unknown>;
    expect(o.type).toBe('postgres');
    expect(o.url).toBe(process.env.DATABASE_URL);
    expect(String((o.entities as string[])[0])).toMatch(
      /src\/\*\*\/\*\.entity\.\{ts,js\}$/,
    );
    expect(String((o.migrations as string[])[0])).toMatch(
      /database\/migrations\/\*\.\{ts,js\}$/,
    );
    expect(o.namingStrategy).toBeInstanceOf(SnakeNamingStrategy);
  });
});
