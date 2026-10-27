import i18n, { type FormatFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  localDigits,
  formatTaka,
} from '@/lib/format';
import { en, type Translation } from './en';
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGES,
  type Language,
} from './languages';

/** English ships with the app (and stands in for any missing key); others load when chosen. */
const LOADERS: Record<Exclude<Language, 'en'>, () => Promise<Translation>> = {
  bn: () => import('./bn').then((m) => m.bn),
};

const asLanguage = (lng: string | undefined): Language =>
  isLanguage(lng) ? lng : DEFAULT_LANGUAGE;

/** Sets up translation in `lang`. Call once, before the first render. */
export async function initI18n(lang: Language): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES,
    // React escapes what it renders.
    interpolation: { escapeValue: false },
  });
  const f = i18n.services.formatter;
  f?.add('number', (value: number | string, lng) =>
    formatNumber(value, asLanguage(lng)),
  );
  f?.add('taka', (value: string | number, lng) =>
    formatTaka(value, asLanguage(lng)),
  );
  f?.add('date', (value: string, lng) => formatDate(value, asLanguage(lng)));
  f?.add('datetime', (value: string, lng) =>
    formatDateTime(value, asLanguage(lng)),
  );
  f?.add('role', (value: string, lng) =>
    i18n.t(`roles.${value}` as never, { lng, defaultValue: value }),
  );
  f?.add('district', (value: string, lng) =>
    i18n.t(`districts.${value}` as never, { lng, defaultValue: value }),
  );
  // Statuses, stages and the like; a missing one reads "no longer active".
  f?.add('word', (value: string | null, lng) =>
    i18n.t(`words.${value || 'none'}` as never, {
      lng,
      defaultValue: value ?? '',
    }),
  );
  localNumbers();
  try {
    await applyLanguage(lang);
  } catch {
    // Its words could not be fetched: open in English.
  }
}

/** A value that is only a number: 12, "12", "-3.5", "1,200". */
const BARE_NUMBER = /^-?[\d,]+(\.\d+)?$/;

/** Units' Bengali symbols by their English one ("kg" → "কেজি"), from the catalog. */
let unitWords: ReadonlyMap<string, string> = new Map();

/**
 * A unit's symbol in `lang`: the catalog's Bengali one for a Bengali reader,
 * else as given (a symbol the catalog does not know stays as it is).
 */
export const unitIn = (symbol: string, lang: Language): string =>
  lang === 'bn' ? (unitWords.get(symbol) ?? symbol) : symbol;

/**
 * The catalog's units, for wording them in Bengali; screens already shown
 * are worded again (as on a language change) once they arrive or change.
 */
export function setUnitWords(
  units: ReadonlyArray<{ symbol: string; symbolBn: string }>,
): void {
  const next = new Map(units.map((u) => [u.symbol, u.symbolBn] as const));
  const same =
    next.size === unitWords.size &&
    [...next].every(([k, v]) => unitWords.get(k) === v);
  if (same) return;
  unitWords = next;
  if (i18n.isInitialized) i18n.emit('languageChanged', i18n.language);
}

/** Every string in a translation, however deep. */
const strings = (o: unknown): string[] =>
  typeof o === 'string'
    ? [o]
    : Object.values(o as Record<string, unknown>).flatMap(strings);

/**
 * Values that feed a nested plural ($t(units.minute, {"count": {{minutes}} })):
 * they go into its JSON as plain digits, and the nested words format them.
 */
const NESTED_COUNTS = new Set(
  strings(en).flatMap((text) =>
    [...text.matchAll(/\$t\([^)]*?\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!),
  ),
);

/**
 * Values put into a sentence read in the sentence's language: a bare number
 * (a record number, a quantity sent as text) in Bengali digits for a Bengali
 * reader. Names, codes, ids and anything mixed stay as they are, and so do
 * digits written into the sentence itself (a phone number to copy, A4).
 * Every value passes through here (alwaysFormat); named formats first.
 */
function localNumbers(): void {
  const { formatter } = i18n.services;
  // Not in i18next's types: the interpolator's format function and switch.
  const interpolator = i18n.services.interpolator as unknown as
    { format: FormatFunction; alwaysFormat: boolean } | undefined;
  if (!formatter || !interpolator) return;
  const named = formatter.format.bind(formatter);
  const format: FormatFunction = (value, fmt, lng, options) => {
    const key = (options as { interpolationkey?: string } | undefined)
      ?.interpolationkey;
    const out: unknown = fmt ? named(value, fmt, lng, options) : value;
    // A unit put into a sentence ({{unit}}) reads in the sentence's language.
    if (key === 'unit' && typeof out === 'string') {
      return unitIn(out, asLanguage(lng));
    }
    const bare =
      !(key && NESTED_COUNTS.has(key)) &&
      (typeof out === 'number' ||
        (typeof out === 'string' && BARE_NUMBER.test(out)));
    return (
      asLanguage(lng) === 'bn' && bare ? localDigits(String(out), 'bn') : out
    ) as string;
  };
  interpolator.format = format;
  interpolator.alwaysFormat = true;
  i18n.options.interpolation = {
    ...i18n.options.interpolation,
    alwaysFormat: true,
  };
}

let wanted: Language = DEFAULT_LANGUAGE;

/** Shows the app in `lang`, fetching its words the first time. The last call wins. */
export async function applyLanguage(lang: Language): Promise<void> {
  wanted = lang;
  if (lang !== 'en' && !i18n.hasResourceBundle(lang, 'translation')) {
    const words = await LOADERS[lang]();
    i18n.addResourceBundle(lang, 'translation', words);
  }
  if (wanted !== lang) return; // chosen again while loading
  await i18n.changeLanguage(lang);
  globalThis.document?.documentElement.setAttribute('lang', lang);
}

export { i18n };
