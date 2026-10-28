import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type BankViewDto,
  useTrackRecordBankViewMutation,
} from '@/api/generated/track-record';
import { FormError } from '@/app/auth/form-error';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useFormat } from '@/i18n/use-format';
import { SummaryView } from './summary-view';

/**
 * A bank officer opens a farmer's latest track record. Opening it is a
 * ledger transaction from the officer's own key, refused without current
 * permission and logged where the farmer and WeGro can see it; the record
 * shown is checked against the ledger's fingerprint.
 */
export function BankViewPage({ farmerId }: { farmerId: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [view, viewing] = useTrackRecordBankViewMutation();
  const [result, setResult] = useState<BankViewDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      setResult((await view({ farmerId }).unwrap()).data);
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <div className="grid gap-6">
      <Link
        to="/bank/farmers"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.farmers')}
      </Link>
      {!result ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-lg">
              {t('trackRecords.openRecord')}
            </CardTitle>
            <CardDescription>
              {t('trackRecords.openRecordText')}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <FormError error={error} />
            <Button disabled={viewing.isLoading} onClick={() => void go()}>
              <Eye />{' '}
              {viewing.isLoading
                ? t('people.actions.working')
                : t('trackRecords.openRecord')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-3 rounded-2xl bg-ink p-5 text-white sm:p-8">
            <span className="flex flex-wrap gap-1.5">
              <StatusPill
                tone={result.verified ? 'success' : 'danger'}
                appearance="soft"
              >
                {result.verified
                  ? t('payouts.verified')
                  : t('payouts.notVerified')}
              </StatusPill>
            </span>
            <h1 className="text-2xl font-bold sm:text-4xl">
              {result.farmer.name}
            </h1>
            <p className="text-white/85">
              {t('trackRecords.versionPublishedOn', {
                version: result.version,
                date: fmt.date(result.publishedAt),
              })}{' '}
              ·{' '}
              {t('trackRecords.viewLogged', {
                date: fmt.dateTime(result.viewedAt),
              })}
            </p>
          </section>
          <SummaryView summary={result.summary} />
        </>
      )}
    </div>
  );
}
