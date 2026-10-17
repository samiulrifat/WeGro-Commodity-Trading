import type { i18n as I18n } from 'i18next';
import type { ApiError } from '@/api/errors';
import { ERROR_CODES, type ErrorCode } from '@/api/generated/codes';
import type { NotificationDto } from '@/api/generated/notifications';

type Values = Record<string, unknown>;

/** t() for a key built at run time (each is checked to exist first). */
const byKey = (i18n: I18n) =>
  i18n.t.bind(i18n) as unknown as (key: string, values?: Values) => string;

const KNOWN = new Set<string>(ERROR_CODES);
const isErrorCode = (code: unknown): code is ErrorCode =>
  typeof code === 'string' && KNOWN.has(code);

/**
 * The values to put into a sentence: plain ones only (lists are worded
 * separately), and for a Bengali reader the Bengali form of a name where
 * the server sent one (`label` and `labelBn`).
 */
function sentenceValues(values: Values | null | undefined, i18n: I18n): Values {
  const bengali = i18n.resolvedLanguage === 'bn';
  const out: Values = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (k.endsWith('Bn') || (v !== null && typeof v === 'object')) continue;
    const bn = values?.[`${k}Bn`];
    // i18next skips formatters for null: an empty value still reaches them.
    out[k] = bengali && typeof bn === 'string' && bn !== '' ? bn : (v ?? '');
  }
  return out;
}

interface Coded {
  code?: unknown;
  message?: unknown;
  details?: Values | null;
}

interface FieldError {
  field: string;
  rule: string;
  limit?: number;
}

const asFieldErrors = (v: unknown): FieldError[] =>
  Array.isArray(v) ? (v as FieldError[]) : [];

/** One failed input check: "slots must be at least 1". */
function ruleText({ field, rule, limit }: FieldError, i18n: I18n): string {
  const t = byKey(i18n);
  const key = i18n.exists(`errors.rule.${rule}`)
    ? `errors.rule.${rule}`
    : 'errors.rule.invalid';
  return t(key, { field, limit });
}

/** A coded error or problem in the reader's language, with its own lists. */
function codedText(e: Coded, i18n: I18n): string | null {
  if (!isErrorCode(e.code)) return null;
  const values = sentenceValues(e.details, i18n);
  const fields = asFieldErrors(e.details?.fields);
  const problems = e.details?.problems;
  if (fields.length > 0) {
    values.fields = fields.map((f) => ruleText(f, i18n)).join('; ');
  }
  if (Array.isArray(problems)) {
    values.problems = (problems as Coded[])
      .map(
        (p) =>
          codedText(p, i18n) ??
          (typeof p.message === 'string' ? p.message : ''),
      )
      .join('; ');
  }
  return byKey(i18n)(`errors.code.${e.code}`, values);
}

/**
 * A failed request in the reader's language: worded from its code and
 * details; a ledger refusal (no wording of its own) shows the server's
 * English to English readers and a sentence for its kind to others.
 */
export function errorText(error: ApiError, i18n: I18n): string {
  const text = codedText(error, i18n);
  if (text !== null) return text;
  if (i18n.resolvedLanguage === 'en' && error.messages.length > 0) {
    return error.messages.join(' ');
  }
  return byKey(i18n)(`errors.kind.${error.kind}`);
}

/**
 * For forms: each field the server refused, with what is wrong with it in
 * the reader's language (the first problem per field).
 */
export function fieldErrors(
  error: ApiError,
  i18n: I18n,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of asFieldErrors(error.details?.fields)) {
    out[f.field] ??= ruleText(f, i18n);
  }
  return out;
}

type NotificationText = Pick<
  NotificationDto,
  'kind' | 'title' | 'body' | 'params'
>;

/**
 * A notification in the reader's language, worded from its kind and values.
 * Older ones (saved before their values were) keep the server's English.
 */
export function notificationText(
  n: NotificationText,
  i18n: I18n,
): { title: string; body: string | null } {
  const key = `notifications.${n.kind}`;
  if (!n.params || !i18n.exists(`${key}.title`)) {
    return { title: n.title, body: n.body ?? null };
  }
  const t = byKey(i18n);
  const values = sentenceValues(n.params, i18n);
  for (const [k, v] of Object.entries(values)) values[k] = v === '' ? '—' : v;
  return {
    title: t(`${key}.title`, values),
    body: i18n.exists(`${key}.body`) ? t(`${key}.body`, values) : null,
  };
}
