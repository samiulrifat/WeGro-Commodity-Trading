import {
  fieldRecordsApi,
  type PhotoDto,
  type SyncResultDto,
} from '@/api/generated/field-records';
import { apiFetch, apiUrl } from '@/api/http';
import { drafts } from '@/lib/drafts';
import {
  type FarmUpdateData,
  type FarmUpdateDraft,
  toSyncRecord,
} from './draft';

/** The server takes at most this many drafts per request. */
export const BATCH = 50;

export interface SendSummary {
  sent: number;
  rejected: number;
  /** Left for later: no internet, or the ledger not ready. */
  waiting: number;
  /** No answer from the server at all (offline). */
  offline: boolean;
}

type Dispatch = (action: unknown) => unknown;

class Offline extends Error {}

let running: Promise<SendSummary> | null = null;

/**
 * Sends this person's farm update drafts: photos first (each once; the
 * same photo always gets the same id), then the drafts in batches. Sent
 * ones leave the phone; refused ones stay, marked to be fixed; the rest
 * wait for the next try. One run at a time, also across the app's tabs.
 */
export function sendDrafts(
  ownerId: string,
  dispatch?: Dispatch,
): Promise<SendSummary> {
  running ??= withLock(() => run(ownerId, dispatch)).finally(() => {
    running = null;
  });
  return running;
}

/** Whether a run is going on in this tab now. */
export const isSending = () => running !== null;

function withLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request('wegro-farm-updates', work) : work();
}

async function run(ownerId: string, dispatch?: Dispatch): Promise<SendSummary> {
  const summary: SendSummary = {
    sent: 0,
    rejected: 0,
    waiting: 0,
    offline: false,
  };
  const waiting = (await drafts.list<FarmUpdateData>(ownerId, 'farm-update'))
    .filter((d) => !d.rejection)
    // Oldest first: a correction after the record it corrects.
    .sort((a, b) => a.createdAt - b.createdAt);
  if (waiting.length === 0) return summary;
  try {
    const ready: FarmUpdateDraft[] = [];
    for (const d of waiting) {
      const withPhoto = await uploadPhoto(d);
      if (withPhoto) ready.push(withPhoto);
      else summary.rejected++;
    }
    for (let i = 0; i < ready.length; i += BATCH) {
      const batch = ready.slice(i, i + BATCH);
      const results = await post(batch);
      const byId = new Map(batch.map((d) => [d.id, d]));
      for (const r of results) {
        const d = byId.get(r.id);
        if (!d) continue;
        if (r.outcome === 'recorded' || r.outcome === 'already_recorded') {
          await drafts.remove(d.id);
          summary.sent++;
        } else if (r.outcome === 'rejected') {
          await drafts.save({
            ...d,
            rejection: {
              code: r.code ?? 'INVALID_RECORD',
              message: r.message ?? '',
              details: r.details,
            },
          });
          summary.rejected++;
        } else {
          summary.waiting++;
        }
      }
    }
  } catch (e) {
    if (!(e instanceof Offline)) throw e;
    summary.offline = true;
  }
  const done = summary.sent + summary.rejected;
  summary.waiting = Math.max(summary.waiting, waiting.length - done);
  if (summary.sent > 0)
    dispatch?.(fieldRecordsApi.util.invalidateTags(['Field records']));
  return summary;
}

/**
 * The draft with its photo uploaded (or none to upload); null if the
 * server refused the photo itself (the draft is marked to be fixed).
 */
async function uploadPhoto(
  d: FarmUpdateDraft,
): Promise<FarmUpdateDraft | null> {
  const photo = d.photos[0];
  if (d.data.photoId || !photo) return d;
  const form = new FormData();
  form.append('file', photo, 'farm-update.jpg');
  const res = await call('/api/photos', { method: 'POST', body: form });
  const body = (await res.json().catch(() => null)) as
    (ErrorBody & { data?: PhotoDto }) | null;
  if (res.ok && body?.data) {
    return drafts.save({ ...d, data: { ...d.data, photoId: body.data.id } });
  }
  if (!refused(res.status)) throw new Offline();
  await drafts.save({
    ...d,
    rejection: {
      code: body?.code ?? 'PHOTO_INVALID',
      message: [body?.message ?? ''].flat().join(' '),
      details: body?.details,
    },
  });
  return null;
}

/**
 * One outcome per draft. If the server refuses the request as a whole (a
 * draft it cannot read at all), the drafts go one by one so only that one
 * is marked to be fixed.
 */
async function post(batch: FarmUpdateDraft[]): Promise<SyncResultDto[]> {
  const res = await call('/api/field-records/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: batch.map(toSyncRecord) }),
  });
  if (res.ok) return ((await res.json()) as { data: SyncResultDto[] }).data;
  if (!refused(res.status)) throw new Offline();
  if (batch.length > 1) {
    const out: SyncResultDto[] = [];
    for (const d of batch) out.push(...(await post([d])));
    return out;
  }
  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  return [
    {
      id: batch[0]!.id,
      outcome: 'rejected',
      code: body?.code ?? 'INVALID_INPUT',
      message: [body?.message ?? ''].flat().join(' '),
      details: body?.details,
    },
  ];
}

interface ErrorBody {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
}

/** A refusal of what was sent (fix it), not a passing problem (try later). */
const refused = (status: number) =>
  status >= 400 &&
  status < 500 &&
  status !== 401 &&
  status !== 408 &&
  status !== 429;

/** A request; no answer at all counts as offline. */
async function call(path: string, init: RequestInit): Promise<Response> {
  try {
    return await apiFetch(apiUrl(path), init);
  } catch {
    throw new Offline();
  }
}
