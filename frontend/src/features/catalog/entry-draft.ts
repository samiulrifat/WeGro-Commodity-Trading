import { CODE, suggestCode, wholeIn } from './catalog';

/** The fields every catalog entry has, as typed. */
export interface BasicDraft {
  code: string;
  /** The code was typed by hand: stop following the name. */
  codeTyped: boolean;
  name: string;
  nameBn: string;
  sortOrder: string;
  active: boolean;
}

interface Basics {
  code: string;
  name: string;
  nameBn: string;
  sortOrder: number;
  active: boolean;
}

export const newBasics = (): BasicDraft => ({
  code: '',
  codeTyped: false,
  name: '',
  nameBn: '',
  sortOrder: '0',
  active: true,
});

export const basicsOf = (e: Basics): BasicDraft => ({
  code: e.code,
  codeTyped: true,
  name: e.name,
  nameBn: e.nameBn,
  sortOrder: String(e.sortOrder),
  active: e.active,
});

/** A change to the draft; the English name carries the code along until it is typed. */
export function changeBasics(
  draft: BasicDraft,
  patch: Partial<BasicDraft>,
  creating: boolean,
): BasicDraft {
  const next = { ...draft, ...patch };
  if (creating && patch.name !== undefined && !next.codeTyped) {
    next.code = suggestCode(patch.name);
  }
  if (patch.code !== undefined) {
    next.code = patch.code.toUpperCase();
    next.codeTyped = patch.code !== '';
  }
  return next;
}

const clean = (text: string) =>
  text.normalize('NFC').trim().replace(/\s+/g, ' ');

export type BasicProblem = 'code' | 'name' | 'nameBn' | 'sortOrder';

/** What is wrong with the basic fields, by field. */
export function basicProblems(
  draft: BasicDraft,
  creating: boolean,
): Set<BasicProblem> {
  const out = new Set<BasicProblem>();
  if (creating && !CODE.test(draft.code)) out.add('code');
  if (clean(draft.name) === '') out.add('name');
  if (clean(draft.nameBn) === '') out.add('nameBn');
  const order = wholeIn(draft.sortOrder, 0, 10000);
  if (order === 'invalid') out.add('sortOrder');
  return out;
}

/** The basic fields as the server takes them (the code only when creating). */
export function basicsRequest(draft: BasicDraft) {
  const order = wholeIn(draft.sortOrder, 0, 10000);
  return {
    name: clean(draft.name),
    nameBn: clean(draft.nameBn),
    sortOrder: typeof order === 'number' ? order : 0,
  };
}

/** Optional text: empty means none. */
export const optionalText = (text: string): string | null =>
  clean(text) === '' ? null : clean(text);
