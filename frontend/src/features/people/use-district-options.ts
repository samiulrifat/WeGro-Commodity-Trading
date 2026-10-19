import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DISTRICTS } from '@/api/generated/codes';

/** The districts in the reader's language and alphabetical order. */
export function useDistrictOptions() {
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const collator = new Intl.Collator(i18n.language);
    return DISTRICTS.map((d) => ({
      value: d,
      label: t(`districts.${d}`),
    })).sort((a, b) => collator.compare(a.label, b.label));
  }, [t, i18n.language]);
}
