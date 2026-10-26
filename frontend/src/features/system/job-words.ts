import { useTranslation } from 'react-i18next';
import type { JobStatusDto } from '@/api/generated/jobs';
import { useFormat } from '@/i18n/use-format';

type T = (key: string, values?: Record<string, unknown>) => string;

/**
 * A job's name and what it does in the reader's language; a job the app has
 * no words for yet keeps its name and the server's English description.
 */
export function useJobWords() {
  const { t: typed, i18n } = useTranslation();
  const t = typed as unknown as T;
  const fmt = useFormat();
  const known = (name: string) => i18n.exists(`system.job.${name}.title`);
  return {
    title: (j: Pick<JobStatusDto, 'name'>) =>
      known(j.name) ? t(`system.job.${j.name}.title`) : j.name,
    description: (j: Pick<JobStatusDto, 'name' | 'description'>) =>
      known(j.name) ? t(`system.job.${j.name}.text`) : j.description,
    /** "Every minute", "Every 5 minutes", "Every 30 seconds". */
    every: (ms: number) =>
      ms % 60_000 === 0
        ? t('system.everyMinutes', {
            count: ms / 60_000,
            n: fmt.number(ms / 60_000),
          })
        : t('system.everySeconds', {
            count: Math.round(ms / 1000),
            n: fmt.number(Math.round(ms / 1000)),
          }),
  };
}
