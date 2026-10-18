/**
 * Unsent work kept on this device (IndexedDB, so photos fit): a farm update
 * made without internet waits here until it is sent. A draft leaves only when
 * it is sent or its author deletes it; each person sees only their own on a
 * shared phone. The draft's id is also the record's id when sent, so sending
 * it again can never create a second record.
 */

export type DraftKind = 'farm-update';

export interface DraftRejection {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Draft<T = unknown> {
  id: string;
  ownerId: string;
  kind: DraftKind;
  data: T;
  photos: Blob[];
  createdAt: number;
  updatedAt: number;
  /** Why the server refused it last time: fix and send again. */
  rejection: DraftRejection | null;
}

const DB_NAME = 'wegro';
const STORE = 'drafts';
const CHANNEL = 'wegro-drafts';

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('owner', 'ownerId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('Drafts cannot be opened'));
    };
  });
  return opening;
}

/** One request in its own transaction, as a promise. */
async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const request = work(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Draft storage failed'));
  });
}

const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(CHANNEL);
channel?.addEventListener('message', () => listeners.forEach((l) => l()));

function changed(): void {
  listeners.forEach((l) => l());
  channel?.postMessage('changed'); // other tabs of the app
}

let persistenceAsked = false;

/**
 * Asks the browser to keep the app's storage even when space runs low, so
 * drafts are not cleared behind the person's back. Once per page load.
 */
function askToPersist(): void {
  if (persistenceAsked) return;
  persistenceAsked = true;
  void globalThis.navigator?.storage?.persist?.().catch(() => false);
}

export const drafts = {
  /** Creates or replaces a draft; returns it as stored. */
  async save<T>(
    draft: Omit<Draft<T>, 'createdAt' | 'updatedAt'> &
      Partial<Pick<Draft<T>, 'createdAt'>>,
  ): Promise<Draft<T>> {
    const now = Date.now();
    const stored: Draft<T> = {
      ...draft,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
    };
    await run('readwrite', (s) => s.put(stored));
    askToPersist();
    changed();
    return stored;
  },

  get<T>(id: string): Promise<Draft<T> | undefined> {
    return run(
      'readonly',
      (s) => s.get(id) as IDBRequest<Draft<T> | undefined>,
    );
  },

  /** One person's drafts, newest change first; optionally of one kind. */
  async list<T>(ownerId: string, kind?: DraftKind): Promise<Draft<T>[]> {
    const all = await run(
      'readonly',
      (s) => s.index('owner').getAll(ownerId) as IDBRequest<Draft<T>[]>,
    );
    return all
      .filter((d) => !kind || d.kind === kind)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** Gone for good: after it was sent, or when its author deletes it. */
  async remove(id: string): Promise<void> {
    await run('readwrite', (s) => s.delete(id));
    changed();
  },

  /** Called after any change here or in another tab of the app. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
