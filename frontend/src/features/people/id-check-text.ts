import type { TFunction } from 'i18next';
import type { DetailField } from '@/api/generated/participants';
import { fieldOfRule, type IdCheck } from './person';

/** Values that name a district are shown by its name in the reader's language. */
const DISTRICT_PARAMS = new Set(['issued', 'given']);

/** Why a check passed, warned or failed, in the reader's language. */
export function checkText(check: IdCheck, t: TFunction): string {
  // Checks saved before reasons were recorded keep their English.
  if (!check.reason) return check.message;
  const params = Object.fromEntries(
    Object.entries(check.params ?? {}).map(([k, v]) => [
      k,
      DISTRICT_PARAMS.has(k) ? t(`districts.${v}` as never) : v,
    ]),
  );
  return t(`idCheck.reason.${check.reason}`, params);
}

/** The first failed check of each detail, to show under its field. */
export function problemsOf(
  checks: readonly IdCheck[],
  t: TFunction,
): Partial<Record<DetailField, string>> {
  const problems: Partial<Record<DetailField, string>> = {};
  for (const check of checks) {
    const field = fieldOfRule(check.code);
    if (check.result === 'fail' && field && !problems[field]) {
      problems[field] = checkText(check, t);
    }
  }
  return problems;
}
