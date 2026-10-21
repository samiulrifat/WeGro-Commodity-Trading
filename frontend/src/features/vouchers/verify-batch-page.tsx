import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useVerifyBatchQuery } from '@/api/generated/verify';
import { AuthPage } from '@/app/auth/auth-page';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFormat } from '@/i18n/use-format';

/**
 * Opened by the QR on a bag, by anyone, without signing in: whether this
 * lot is registered on WeGro's ledger, and what it is.
 */
export function VerifyBatchPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const query = useVerifyBatchQuery({ id });
  const bengali = i18n.resolvedLanguage === 'bn';
  const v = query.data?.data;
  return (
    <AuthPage title={t('verifyBatch.title')} intro={t('verifyBatch.intro')}>
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {v && (
        <div className="grid gap-5">
          {!v.genuine ? (
            <Alert variant="destructive">
              <CircleX />
              <AlertTitle>{t('verifyBatch.notGenuine')}</AlertTitle>
              <AlertDescription>
                {t('verifyBatch.notGenuineText')}
              </AlertDescription>
            </Alert>
          ) : v.expired ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t('verifyBatch.expired')}</AlertTitle>
              <AlertDescription>
                {t('verifyBatch.expiredText')}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-success/40 bg-success-soft text-success">
              <CircleCheck />
              <AlertTitle>{t('verifyBatch.genuine')}</AlertTitle>
              <AlertDescription className="text-success">
                {t('verifyBatch.genuineText')}
              </AlertDescription>
            </Alert>
          )}
          {v.genuine && (
            <dl className="divide-y text-sm">
              {v.product && (
                <Row label={t('verifyBatch.product')}>
                  {bengali ? v.product.nameBn : v.product.name}
                </Row>
              )}
              {v.lotNumber && (
                <Row label={t('vouchers.lotNumber')}>{v.lotNumber}</Row>
              )}
              {v.manufacturer && (
                <Row label={t('vouchers.manufacturer')}>{v.manufacturer}</Row>
              )}
              {v.supplierName && (
                <Row label={t('vouchers.supplier')}>{v.supplierName}</Row>
              )}
              {v.producedOn && (
                <Row label={t('vouchers.producedOnLabel')}>
                  {fmt.date(v.producedOn)}
                </Row>
              )}
              <Row label={t('vouchers.expiresOnLabel')}>
                {v.expiresOn ? fmt.date(v.expiresOn) : t('vouchers.noExpiry')}
              </Row>
              {v.registeredAt && (
                <Row label={t('vouchers.registeredAt')}>
                  {fmt.dateTime(v.registeredAt)}
                </Row>
              )}
            </dl>
          )}
        </div>
      )}
    </AuthPage>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
