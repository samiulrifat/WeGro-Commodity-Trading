import {
  CircleCheck,
  CircleX,
  ShieldQuestion,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useLazyAuditVerifyQuery } from '@/api/generated/audit';
import { FormError } from '@/app/auth/form-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import type { HistoryType } from './audit-utils';
import { useAuditWords } from './words';

/**
 * Checks one record against the ledger on asking, and says plainly what
 * came out: it matches, it is not on the ledger, or which parts differ
 * (each in words, with the name a technician would look for).
 */
export function VerifyPanel({ type, id }: { type: HistoryType; id: string }) {
  const { t } = useTranslation();
  const [check, result] = useLazyAuditVerifyQuery();
  const data = result.data?.data;
  return (
    <div className="grid gap-3">
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={result.isFetching}
        onClick={() => void check({ type, id })}
      >
        <ShieldQuestion />
        {result.isFetching
          ? t('audit.verify.checking')
          : t('audit.verify.button')}
      </Button>
      {result.error && <FormError error={toApiError(result.error)} />}
      {data && !result.isFetching && (
        <CheckResult
          onLedger={data.onLedger}
          mismatches={data.mismatches}
          checkedAt={data.checkedAt}
        />
      )}
    </div>
  );
}

/** A check's outcome, in words. */
export function CheckResult({
  onLedger,
  mismatches,
  checkedAt,
}: {
  onLedger: boolean;
  mismatches: readonly string[];
  checkedAt?: string;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const words = useAuditWords();
  if (!onLedger) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>{t('audit.verify.notOnLedger')}</AlertTitle>
        <AlertDescription>{t('audit.verify.notOnLedgerText')}</AlertDescription>
      </Alert>
    );
  }
  if (mismatches.length === 0) {
    return (
      <Alert>
        <CircleCheck />
        <AlertTitle>{t('audit.verify.matches')}</AlertTitle>
        {checkedAt && (
          <AlertDescription>
            {t('audit.verify.matchesText', { time: fmt.dateTime(checkedAt) })}
          </AlertDescription>
        )}
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <CircleX />
      <AlertTitle>{t('audit.verify.differs')}</AlertTitle>
      <AlertDescription>
        <p>{t('audit.verify.differsText')}</p>
        <ul className="mt-1 list-disc pl-5">
          {mismatches.map((m) => (
            <li key={m}>
              {words.mismatch(m)}{' '}
              <code className="text-xs opacity-75">({m})</code>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
