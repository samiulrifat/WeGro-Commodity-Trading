/** The app's languages. English until a person chooses (see the language slice). */
export const LANGUAGES = ['en', 'bn'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Each language named in itself, as the switch shows it. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  bn: 'বাংলা',
};

export const isLanguage = (value: unknown): value is Language =>
  (LANGUAGES as readonly unknown[]).includes(value);
