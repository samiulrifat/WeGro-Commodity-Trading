import { Logger } from '@nestjs/common';
import { fakeRepo } from '../../../test/support/unit';
import { NameIndexService, nameWords } from './name-index.service';

/** People saved before the name index existed are indexed at start-up, in batches. */
describe('NameIndexService', () => {
  afterEach(() => jest.restoreAllMocks());

  const build = (waiting: number, fails = false) => {
    let left = waiting;
    const inserted: unknown[] = [];
    const manager = fakeRepo({
      insert: jest.fn((_e: unknown, rows: unknown[]) => {
        inserted.push(...rows);
        return Promise.resolve({});
      }),
    });
    const tokens = {
      manager: {
        query: jest.fn((_sql: string, [limit]: [number]) => {
          if (fails) return Promise.reject(new Error('db down'));
          const n = Math.min(left, limit);
          left -= n;
          return Promise.resolve(
            Array.from({ length: n }, (_, i) => ({
              userId: `u${left + i}`,
              fullNameEnc: 'x',
            })),
          );
        }),
        transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
      },
    };
    const service = new NameIndexService(
      { blindIndex: (_d: string, w: string) => `idx:${w}` } as never,
      { openName: () => 'Md. Rahim Uddin' } as never,
      tokens as never,
    );
    return { service, tokens, inserted };
  };

  it('indexes everyone waiting, a batch at a time, and says how many', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { service, tokens, inserted } = build(1_200);
    await expect(service.backfill()).resolves.toBe(1_200);
    expect(tokens.manager.transaction).toHaveBeenCalledTimes(3);
    expect(inserted).toHaveLength(1_200 * 3); // md, rahim, uddin
    expect(log).toHaveBeenCalledWith('Indexed the names of 1200 people');
  });

  it('does nothing quietly when everyone is indexed', async () => {
    const log = jest.spyOn(Logger.prototype, 'log');
    await expect(build(0).service.backfill()).resolves.toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('starts anyway if the index cannot be filled in, saying why', async () => {
    const errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    build(5, true).service.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));
    expect(errors).toHaveBeenCalledWith(
      'Name index not filled in: Error: db down',
    );
  });

  it('splits names into whole lower-case words, Bengali too', () => {
    expect(nameWords('Md. Rahim  UDDIN, md')).toEqual(['md', 'rahim', 'uddin']);
    expect(nameWords('মোঃ রহিম উদ্দিন')).toEqual(['মোঃ', 'রহিম', 'উদ্দিন']);
  });
});
