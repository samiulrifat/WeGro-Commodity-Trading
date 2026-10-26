import { useTranslation } from 'react-i18next';
import { useFormat } from '@/i18n/use-format';

const UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
] as const;

/** A length of time in its two largest units: "3 days 4 hours", "45 seconds". */
export function useSpan() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (ms: number): string => {
    let left = Math.max(0, Math.round(ms));
    const parts: string[] = [];
    for (const [unit, size] of UNITS) {
      const n = Math.floor(left / size);
      if (n > 0 && parts.length < 2) {
        parts.push(t(`system.span.${unit}`, { count: n, n: fmt.number(n) }));
        left -= n * size;
      } else if (parts.length > 0) {
        break; // two units at most, and no gaps ("1 day 3 seconds")
      }
    }
    return parts.length > 0
      ? parts.join(' ')
      : t('system.span.second', { count: 0, n: fmt.number(0) });
  };
}
