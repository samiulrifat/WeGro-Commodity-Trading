import { useTranslation } from 'react-i18next';
import type { CatalogDto } from '@/api/generated/catalog';

/** Names of entries other entries point to, in the reader's language. */
export function useEntryLabels() {
  const { i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  const name = (e: { name: string; nameBn: string }) =>
    bengali ? e.nameBn : e.name;
  return {
    name,
    /** "Kilogram (kg)"; the code itself if the unit is unknown. */
    unit(catalog: CatalogDto, code: string): string {
      const u = catalog.units.find((x) => x.code === code);
      return u ? `${name(u)} (${u.symbol})` : code;
    },
    produce(catalog: CatalogDto, code: string): string {
      const p = catalog.produceTypes.find((x) => x.code === code);
      return p ? name(p) : code;
    },
  };
}
