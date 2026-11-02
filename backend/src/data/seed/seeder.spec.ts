import { DataSource } from 'typeorm';

const importer = { validate: jest.fn(), apply: jest.fn() };
jest.mock('../import/importer', () => ({ Importer: jest.fn(() => importer) }));

import { Seeder } from './seeder';

/**
 * The sample data goes through the real importer; if its own rows are
 * wrong, the seeder stops and says which. The stories run end to end in
 * data.chain-spec.ts.
 */
describe('Seeder', () => {
  const build = (alreadyLoaded = false) =>
    new Seeder(
      {
        get: (token: unknown) =>
          token === DataSource
            ? {
                getRepository: () => ({
                  existsBy: () => Promise.resolve(alreadyLoaded),
                }),
              }
            : undefined,
      } as never,
      { scale: 1, log: () => undefined },
    );
  beforeEach(() => jest.clearAllMocks());

  it('runs once per database', async () => {
    await expect(build(true).run()).rejects.toThrow(
      'Sample data is already loaded; reset first (npm run data:reset)',
    );
    expect(importer.validate).not.toHaveBeenCalled();
  });

  it('stops on the first problems in its own rows, naming them', async () => {
    importer.validate.mockResolvedValueOnce([
      { file: 'people.csv', line: 2, id: 'S-P1', message: 'phone is missing' },
    ]);
    await expect(build().run()).rejects.toThrow(
      'Sample data failed validation: people.csv:2 phone is missing',
    );
  });

  it('stops when rows fail to import, naming them', async () => {
    importer.validate.mockResolvedValueOnce([]);
    importer.apply.mockResolvedValueOnce({
      outcomes: [
        { id: 'S-P1', result: 'imported', message: '' },
        { id: 'S-P2', result: 'failed', message: 'ledger refused' },
      ],
      credentials: [],
    });
    await expect(build().run()).rejects.toThrow(
      'Import failed: S-P2: ledger refused',
    );
  });
});
