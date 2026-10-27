import { useTranslation } from 'react-i18next';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { District } from '@/api/generated/codes';
import { knownDistrict } from '@/features/marketplace/market-utils';
import { en } from '@/i18n/en';

/** The name of a catalog produce in the reader's language. */
export function useProduceName() {
  const { i18n } = useTranslation();
  const catalog = useCatalogGetQuery({});
  const bengali = i18n.resolvedLanguage === 'bn';
  return (code: string) => {
    const p = catalog.data?.data.produceTypes.find((x) => x.code === code);
    return p ? (bengali ? p.nameBn : p.name) : code;
  };
}

/** A district's code by its English name ("Bogura" → BOGURA), for answers that send only the name. */
const CODE_BY_NAME = new Map(
  Object.entries(en.districts).map(([code, name]) => [
    name.toLowerCase(),
    code,
  ]),
);

/**
 * A district in the reader's language, from its code and name or its
 * English name alone. A name not in the list (such as the bank list's own
 * spellings) stays as given.
 */
export function useDistrictName() {
  const { t } = useTranslation();
  return (d: { code: string; name: string } | string | null | undefined) => {
    if (!d) return '';
    const code =
      typeof d === 'string' ? CODE_BY_NAME.get(d.toLowerCase()) : d.code;
    const name = typeof d === 'string' ? d : d.name;
    return code && knownDistrict(code)
      ? t(`districts.${code as District}`)
      : name;
  };
}

/** A weather event type in the reader's language. */
export function useEventTypeName() {
  const { i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (e: { name: string; nameBn: string }) => (bengali ? e.nameBn : e.name);
}
