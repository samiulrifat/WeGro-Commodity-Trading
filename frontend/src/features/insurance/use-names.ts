import { useTranslation } from 'react-i18next';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { District } from '@/api/generated/codes';
import { knownDistrict } from '@/features/marketplace/market-utils';

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

/** A district in the reader's language. */
export function useDistrictName() {
  const { t } = useTranslation();
  return (d: { code: string; name: string }) =>
    knownDistrict(d.code) ? t(`districts.${d.code as District}`) : d.name;
}

/** A weather event type in the reader's language. */
export function useEventTypeName() {
  const { i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (e: { name: string; nameBn: string }) => (bengali ? e.nameBn : e.name);
}
