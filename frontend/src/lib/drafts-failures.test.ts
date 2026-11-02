// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

/** A request that fails as soon as its handler is set. */
function failing<T>(error: DOMException | null) {
  const request = { error } as unknown as IDBRequest<T>;
  queueMicrotask(() => request.onerror?.(new Event('error')));
  return request;
}

describe('draft storage failing', () => {
  it('says the drafts cannot be opened, and tries again next time', async () => {
    const real = indexedDB.open.bind(indexedDB);
    const open = vi
      .spyOn(indexedDB, 'open')
      .mockImplementationOnce(() => failing(null) as never)
      .mockImplementationOnce(
        () => failing(new DOMException('Blocked')) as never,
      )
      .mockImplementation(real);
    const { drafts } = await import('./drafts');
    await expect(drafts.list('me')).rejects.toThrow('Drafts cannot be opened');
    await expect(drafts.list('me')).rejects.toThrow('Blocked');
    await expect(drafts.list('me')).resolves.toEqual([]);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('says when a request fails', async () => {
    const { drafts } = await import('./drafts');
    await drafts.list('me');
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(
      () => failing(null) as never,
    );
    await expect(drafts.get('x')).rejects.toThrow('Draft storage failed');
  });
});
