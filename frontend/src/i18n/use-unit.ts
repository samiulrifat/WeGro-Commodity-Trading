import { useTranslation } from 'react-i18next';
import { unitIn } from './index';
import { DEFAULT_LANGUAGE, isLanguage } from './languages';

/**
 * A unit's symbol in the reader's language, for a unit shown outside a
 * sentence: the Bengali one sent with the record if there is one, else the
 * catalog's.
 */
export function useUnit() {
  const { i18n } = useTranslation();
  const lang = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;
  return (symbol: string, symbolBn?: string | null): string =>
    lang === 'bn' && symbolBn ? symbolBn : unitIn(symbol, lang);
}
