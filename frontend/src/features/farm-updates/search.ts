/** What the farm update form opens with, kept in the address. */
export interface NewUpdateSearch {
  /** Open a draft kept on this phone (to fix or finish it). */
  draft?: string;
  /** Correct this record. */
  corrects?: string;
  /** Start for this project. */
  project?: string;
}

export interface UpdateListSearch {
  q?: string;
  page?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (raw: unknown) =>
  typeof raw === 'string' && UUID.test(raw) ? raw.toLowerCase() : undefined;

export function parseNewUpdateSearch(
  raw: Record<string, unknown>,
): NewUpdateSearch {
  const out: NewUpdateSearch = {};
  const draft = id(raw.draft);
  const corrects = id(raw.corrects);
  const project = id(raw.project);
  if (draft) out.draft = draft;
  else if (corrects) out.corrects = corrects;
  else if (project) out.project = project;
  return out;
}

export function parseUpdateListSearch(
  raw: Record<string, unknown>,
): UpdateListSearch {
  const out: UpdateListSearch = {};
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

/** An ISO time as a datetime-local field shows it (the phone's time zone). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** A datetime-local value back to ISO, or null if it is not a time. */
export function fromLocalInput(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
