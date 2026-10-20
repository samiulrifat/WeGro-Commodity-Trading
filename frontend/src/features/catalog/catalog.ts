import type { Role } from '@/app/navigation';
import { latinDigits } from '@/lib/format';

/** Who adds, changes and retires entries; everyone else reads. */
const EDITORS: ReadonlySet<Role> = new Set<Role>([
  'super_admin',
  'admin',
  'operations',
]);
export const canEditCatalog = (role: Role) => EDITORS.has(role);

/** As the ledger takes a code (the server's CODE_PATTERN). */
export const CODE = /^[A-Z0-9_-]{1,31}$/;
/** A measurement's key, as the server takes it. */
export const MEASUREMENT_KEY = /^[a-z][a-z0-9_]{0,31}$/;

/** Plain ASCII words of a name: accents dropped, anything else a gap. */
const words = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

/** A code suggested from the English name: "Boro rice" gives BORO_RICE. */
export function suggestCode(name: string): string {
  return words(name).join('_').toUpperCase().slice(0, 31).replace(/_+$/, '');
}

/** A measurement key suggested from its label: "Plant height" gives plant_height. */
export function suggestKey(label: string): string {
  const key = words(label).join('_').toLowerCase().slice(0, 32);
  return /^[a-z]/.test(key) ? key.replace(/_+$/, '') : '';
}

/** Which entries a list shows: those in use, the retired, or both. */
export type Shown = 'active' | 'retired' | 'all';

export interface CatalogSearch {
  /** Words of a name (English or Bengali) or a code. */
  q?: string;
  /** Editors only; everyone else sees what is in use. */
  show?: Exclude<Shown, 'active'>;
}

export function parseCatalogSearch(
  raw: Record<string, unknown>,
): CatalogSearch {
  const out: CatalogSearch = {};
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  if (raw.show === 'retired' || raw.show === 'all') out.show = raw.show;
  return out;
}

interface Searchable {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
}

const fold = (text: string) => latinDigits(text).normalize('NFC').toLowerCase();

/**
 * The entries a search finds: every word typed must start a word of the
 * name in either language, of the code, or of the `extra` texts (a unit's
 * symbol, a seed's crop). Lists are a few dozen entries, so this runs here.
 */
export function findEntries<T extends Searchable>(
  entries: readonly T[],
  q: string | undefined,
  shown: Shown,
  extra: (entry: T) => readonly (string | null | undefined)[] = () => [],
): T[] {
  const wanted = fold(q ?? '')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  return entries.filter((e) => {
    if (shown === 'active' && !e.active) return false;
    if (shown === 'retired' && e.active) return false;
    if (wanted.length === 0) return true;
    const have = [e.name, e.nameBn, e.code.replace(/[_-]/g, ' '), ...extra(e)]
      .filter((t): t is string => !!t)
      .flatMap((t) => fold(t).split(/[^\p{L}\p{M}\p{N}]+/u));
    return wanted.every((w) => have.some((h) => h.startsWith(w)));
  });
}

/**
 * A number typed in a form (Bengali digits allowed): null when left empty,
 * NaN when it is not a number.
 */
export function numberOf(text: string): number | null {
  const t = latinDigits(text).trim();
  if (t === '') return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** Decimal places of a number, as the server counts them: 2.50 has 1. */
export function decimalsOf(n: number): number {
  const s = String(n);
  const exp = /e-(\d+)$/.exec(s);
  if (exp)
    return Number(exp[1]) + (s.split('e')[0]!.split('.')[1]?.length ?? 0);
  return s.split('.')[1]?.length ?? 0;
}

/** A whole number in [min, max], or null for an empty optional one. */
export function wholeIn(
  text: string,
  min: number,
  max: number,
): number | null | 'invalid' {
  const n = numberOf(text);
  if (n === null) return null;
  return Number.isInteger(n) && n >= min && n <= max ? n : 'invalid';
}
