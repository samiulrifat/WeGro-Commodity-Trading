import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type DateValue,
  formatCompact,
  formatDate,
  formatDateTime,
  formatMonth,
  formatNumber,
  formatRelative,
  formatTaka,
  formatTime,
} from '@/lib/format';
import { DEFAULT_LANGUAGE, isLanguage } from './languages';

/** The formatters in the language on screen; re-renders when it changes. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lang = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;
  return useMemo(
    () => ({
      lang,
      number: (v: number | string, decimals?: number) =>
        formatNumber(v, lang, { decimals }),
      taka: (v: string | number) => formatTaka(v, lang),
      takaShort: (v: string | number) => formatTaka(v, lang, { compact: true }),
      compact: (v: number) => formatCompact(v, lang),
      date: (v: DateValue) => formatDate(v, lang),
      month: (v: DateValue) => formatMonth(v, lang),
      time: (v: DateValue) => formatTime(v, lang),
      dateTime: (v: DateValue) => formatDateTime(v, lang),
      relative: (v: DateValue) => formatRelative(v, lang),
    }),
    [lang],
  );
}
