import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from './drafts';

const persist = vi.fn(async () => true);

/** A fresh database and module each time. */
async function fresh() {
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal('navigator', { storage: { persist } });
  vi.resetModules();
  return (await import('./drafts')).drafts;
}

const draft = (over: Partial<Draft<{ note: string }>> = {}) => ({
  id: crypto.randomUUID(),
  ownerId: 'officer-1',
  kind: 'farm-update' as const,
  data: { note: 'leaves yellowing' },
  photos: [] as Blob[],
  rejection: null,
  ...over,
});

describe('drafts on this device', () => {
  beforeEach(() => persist.mockClear());

  it('keeps each person’s drafts apart, newest change first', async () => {
    const drafts = await fresh();
    const first = await drafts.save(draft());
    await new Promise((r) => setTimeout(r, 2));
    const second = await drafts.save(draft());
    await drafts.save(draft({ ownerId: 'officer-2' }));
    const mine = await drafts.list('officer-1', 'farm-update');
    expect(mine.map((d) => d.id)).toEqual([second.id, first.id]);
    expect(await drafts.list('officer-2')).toHaveLength(1);
    expect(await drafts.list('nobody')).toEqual([]);
  });

  it('keeps photos exactly, and the time it was first saved', async () => {
    const drafts = await fresh();
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], {
      type: 'image/jpeg',
    });
    const saved = await drafts.save(draft({ photos: [photo] }));
    await new Promise((r) => setTimeout(r, 2));
    const edited = await drafts.save({
      ...saved,
      data: { note: 'better now' },
    });
    expect(edited.createdAt).toBe(saved.createdAt);
    expect(edited.updatedAt).toBeGreaterThan(saved.updatedAt);
    const stored = await drafts.get<{ note: string }>(saved.id);
    expect(stored?.data.note).toBe('better now');
    const [back] = stored!.photos;
    expect(back!.type).toBe('image/jpeg');
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]),
    );
  });

  it('keeps why the server refused it, to fix and send again', async () => {
    const drafts = await fresh();
    const saved = await drafts.save(
      draft({
        rejection: {
          code: 'OBSERVED_AT_FUTURE',
          message: 'observedAt is in the future',
        },
      }),
    );
    expect((await drafts.get(saved.id))?.rejection?.code).toBe(
      'OBSERVED_AT_FUTURE',
    );
  });

  it('removes a draft only when asked, and tells listeners of every change', async () => {
    const drafts = await fresh();
    const heard = vi.fn();
    const stop = drafts.subscribe(heard);
    const saved = await drafts.save(draft());
    await drafts.remove(saved.id);
    expect(await drafts.get(saved.id)).toBeUndefined();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    await drafts.save(draft());
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('asks the browser to keep its storage, once', async () => {
    const drafts = await fresh();
    await drafts.save(draft());
    await drafts.save(draft());
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
