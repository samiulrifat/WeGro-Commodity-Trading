import type { Language } from '@/i18n/languages';

/**
 * Numbers, taka and dates as read in Bangladesh, in English or Bengali.
 * Built from fixed patterns, not the browser's locale data, which differs
 * between browsers (en-BD even puts the month first). Taka arrive from the
 * API as exact decimal strings and never pass through a float; times are
 * shown in Bangladesh time (UTC+6, no daylight saving) wherever the device is.
 */

const BENGALI_ZERO = 0x09e6;

/** Bengali digits in Bengali; the text unchanged in English. */
export function localDigits(text: string, lang: Language): string {
  return lang === 'bn'
    ? text.replace(/[0-9]/g, (d) =>
        String.fromCharCode(BENGALI_ZERO + Number(d)),
      )
    : text;
}

/** Bengali digits typed into a field, turned into the digits the API reads. */
export function latinDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BENGALI_ZERO));
}

/** Thousands separators: 1234567 -> 1,234,567. */
const grouped = (whole: string) => whole.replace(/\B(?=(\d{3})+$)/g, ',');

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * 1234567.5 -> "1,234,567.5" (১,২৩৪,৫৬৭.৫ in Bengali). A decimal string is
 * kept exactly as given; a number is rounded to `decimals` (default up to 2).
 */
export function formatNumber(
  value: number | string,
  lang: Language,
  { decimals }: { decimals?: number } = {},
): string {
  if (typeof value === 'string') {
    const m = DECIMAL.exec(value.trim());
    if (!m) return value;
    const [, sign = '', whole = '0', fraction] = m;
    const text = `${sign}${grouped(whole.replace(/^0+(?=\d)/, ''))}${fraction ? `.${fraction}` : ''}`;
    return localDigits(text, lang);
  }
  if (!Number.isFinite(value)) return '—';
  return localDigits(numberFormat(decimals).format(value), lang);
}

// A formatter is slow to make and quick to use: one per setting, kept.
const numberFormats = new Map<number | undefined, Intl.NumberFormat>();
function numberFormat(decimals: number | undefined): Intl.NumberFormat {
  let f = numberFormats.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: decimals ?? 2,
      minimumFractionDigits: decimals ?? 0,
    });
    numberFormats.set(decimals, f);
  }
  return f;
}

const TAKA = '৳ ';

/**
 * "1234567.50" -> "৳ 1,234,567.50"; "1234567.00" -> "৳ 1,234,567": poisha
 * only when there are some. Exact for any size of amount.
 */
export function formatTaka(
  amount: string | number,
  lang: Language,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (compact) {
    const n = Number(amount);
    return `${n < 0 ? '-' : ''}${TAKA}${formatCompact(Math.abs(n), lang)}`;
  }
  const text = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const m = DECIMAL.exec(text);
  if (!m) return text;
  const [, sign = '', whole = '0', fraction = ''] = m;
  const poisha = fraction.padEnd(2, '0').slice(0, 2);
  const shown = poisha === '00' ? whole : `${whole}.${poisha}`;
  return `${sign}${TAKA}${formatNumber(shown, lang)}`;
}

const COMPACT: Array<{ size: number; en: string; bn: string }> = [
  { size: 1e9, en: 'B', bn: ' বিলিয়ন' },
  { size: 1e6, en: 'M', bn: ' মিলিয়ন' },
  { size: 1e3, en: 'K', bn: ' হাজার' },
];

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** Short figures for cards and charts: 1.2K, 3.4M (১.২ হাজার, ৩.৪ মিলিয়ন). */
export function formatCompact(value: number, lang: Language): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let unit = COMPACT.find((u) => abs >= u.size);
  if (!unit) return formatNumber(oneDecimal(value), lang);
  // 999,960 rounds to 1000.0K: say 1M instead.
  const bigger = COMPACT[COMPACT.indexOf(unit) - 1];
  if (bigger && oneDecimal(abs / unit.size) >= 1000) unit = bigger;
  const n = formatNumber(oneDecimal(value / unit.size), lang);
  return `${n}${unit[lang]}`;
}

const MONTHS: Record<Language, readonly string[]> = {
  en: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  bn: [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ],
};

export type DateValue = string | number | Date;

const DHAKA_OFFSET_MS = 6 * 3_600_000;
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The Bangladesh calendar day and clock time of a value. A YYYY-MM-DD string
 * is already a calendar day in Bangladesh (as the API sends days) and is
 * never shifted; anything else is an instant.
 */
function dhaka(value: DateValue) {
  if (typeof value === 'string') {
    const day = CALENDAR_DAY.exec(value);
    if (day) {
      const [y = 0, m = 1, d = 1] = day.slice(1).map(Number);
      return { y, m: m - 1, d, h: 0, min: 0 };
    }
  }
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  const t = new Date(ms + DHAKA_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
  };
}

/** 17 Oct 2026 (১৭ অক্টোবর ২০২৬). */
export function formatDate(value: DateValue, lang: Language): string {
  const t = dhaka(value);
  if (!t) return '—';
  return localDigits(`${t.d} ${MONTHS[lang][t.m] ?? ''} ${t.y}`, lang);
}

/** Oct 2026 (অক্টোবর ২০২৬), for monthly figures. */
export function formatMonth(value: DateValue, lang: Language): string {
  const t = dhaka(value);
  if (!t) return '—';
  return localDigits(`${MONTHS[lang][t.m] ?? ''} ${t.y}`, lang);
}

/** The part of the day said before a Bengali clock time. */
function dayPart(hour: number): string {
  if (hour >= 4 && hour < 6) return 'ভোর';
  if (hour >= 6 && hour < 12) return 'সকাল';
  if (hour >= 12 && hour < 15) return 'দুপুর';
  if (hour >= 15 && hour < 18) return 'বিকাল';
  if (hour >= 18 && hour < 20) return 'সন্ধ্যা';
  return 'রাত';
}

/** 9:30 PM (রাত ৯:৩০), in Bangladesh time. */
export function formatTime(value: DateValue, lang: Language): string {
  const t = dhaka(value);
  if (!t) return '—';
  const clock = `${t.h % 12 || 12}:${String(t.min).padStart(2, '0')}`;
  return lang === 'bn'
    ? `${dayPart(t.h)} ${localDigits(clock, lang)}`
    : `${clock} ${t.h < 12 ? 'AM' : 'PM'}`;
}

/** 17 Oct 2026, 9:30 PM (১৭ অক্টোবর ২০২৬, রাত ৯:৩০). */
export function formatDateTime(value: DateValue, lang: Language): string {
  const date = formatDate(value, lang);
  return date === '—' ? date : `${date}, ${formatTime(value, lang)}`;
}

const RELATIVE: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/**
 * "5 minutes ago", "yesterday" (৫ মিনিট আগে, গতকাল) for the last week;
 * older ones as a date.
 */
export function formatRelative(
  value: DateValue,
  lang: Language,
  now: number = Date.now(),
): string {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return '—';
  const seconds = Math.round((ms - now) / 1000);
  if (Math.abs(seconds) >= 7 * 86_400) return formatDate(value, lang);
  const rtf = relativeFormat(lang);
  for (const [unit, size] of RELATIVE) {
    if (Math.abs(seconds) >= size) {
      return localDigits(rtf.format(Math.trunc(seconds / size), unit), lang);
    }
  }
  return localDigits(rtf.format(0, 'second'), lang);
}

const relativeFormats = new Map<Language, Intl.RelativeTimeFormat>();
function relativeFormat(lang: Language): Intl.RelativeTimeFormat {
  let f = relativeFormats.get(lang);
  if (!f) {
    f = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    relativeFormats.set(lang, f);
  }
  return f;
}

/** Today in Bangladesh, as a date field takes it (YYYY-MM-DD). */
export const todayBd = () =>
  new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
