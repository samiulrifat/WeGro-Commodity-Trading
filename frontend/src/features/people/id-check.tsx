import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { checkText } from './id-check-text';
import type { IdCheck } from './person';

const LOOK = {
  pass: { icon: CircleCheck, tone: 'text-success', label: 'passed' },
  warn: { icon: CircleAlert, tone: 'text-warning', label: 'warned' },
  fail: { icon: CircleX, tone: 'text-destructive', label: 'failed' },
} as const;

/**
 * Every rule of an ID check with its outcome: what the registrar confirms
 * before registering, and the admin reads before verifying.
 */
export function IdCheckList({
  checks,
  className,
}: {
  checks: readonly IdCheck[];
  className?: string;
}) {
  const { t } = useTranslation();
  // Warnings and failures first: they are what needs reading.
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  const sorted = [...checks].sort((a, b) => order[a.result] - order[b.result]);
  return (
    <ul className={cn('grid gap-2', className)}>
      {sorted.map((check) => {
        const look = LOOK[check.result];
        const Icon = look.icon;
        return (
          <li
            key={`${check.code}-${check.reason ?? check.message}`}
            className="flex items-start gap-2.5 text-sm"
          >
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', look.tone)}
              aria-label={t(`idCheck.${look.label}`)}
            />
            <span>
              <span className="font-medium">
                {t(`idCheck.rule.${check.code}` as never, {
                  defaultValue: check.code,
                })}
                :
              </span>{' '}
              <span
                className={
                  check.result === 'pass' ? 'text-muted-foreground' : undefined
                }
              >
                {checkText(check, t)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
