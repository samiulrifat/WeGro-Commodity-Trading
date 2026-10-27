import { useEffect } from 'react';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import { setUnitWords } from './index';

/**
 * Keeps the units' Bengali symbols in step with the catalog, so a unit put
 * into a sentence ({{unit}}) reads in the reader's language. Mounted once
 * in the signed-in shell; renders nothing.
 */
export function UnitWords() {
  const { data } = useCatalogGetQuery({});
  useEffect(() => {
    if (data) setUnitWords(data.data.units);
  }, [data]);
  return null;
}
