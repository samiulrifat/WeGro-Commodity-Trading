import { Logger } from '@nestjs/common';
import { fakeRepo } from '../../../test/support/unit';
import { BankListService } from './bank-list.service';

/**
 * Before any list is loaded the status says so; a list that cannot be
 * loaded at start-up is logged and the app starts without it. Importing
 * runs against Postgres in the chain suite.
 */
describe('BankListService', () => {
  const build = (
    repos: {
      banks?: Record<string, unknown>;
      imports?: Record<string, unknown>;
    } = {},
  ) =>
    new BankListService(
      {} as never,
      fakeRepo(repos.banks) as never,
      fakeRepo() as never,
      fakeRepo(repos.imports) as never,
      fakeRepo() as never,
      {} as never,
    );
  afterEach(() => jest.restoreAllMocks());

  it('reports an empty list before anything was imported', async () => {
    await expect(build().status()).resolves.toEqual({
      bankCount: 0,
      districtCount: 0,
      branchCount: 0,
      importedAt: null,
      importedBy: null,
      source: null,
    });
  });

  it('starts without the list when it cannot be loaded, saying why', async () => {
    const errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = build({
      banks: { count: jest.fn(() => Promise.reject(new Error('db down'))) },
    });
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith('Bank list not loaded: Error: db down');
  });
});
