import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  formatDate,
  formatDateTime,
  formatNumber,
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
  // Statuses, stages and the like; a missing one reads "no longer active".
  f?.add('word', (value: string | null, lng) =>
    i18n.t(`words.${value || 'none'}` as never, {
      lng,
      defaultValue: value ?? '',
    }),
  );
  try {
    await applyLanguage(lang);
  } catch {
    // Its words could not be fetched: open in English.
  }
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
