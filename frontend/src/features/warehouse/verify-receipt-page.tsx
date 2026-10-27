import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useReceiptVerifyVerifyQuery } from '@/api/generated/verify';
import { AuthPage } from '@/app/auth/auth-page';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFormat } from '@/i18n/use-format';
import { receiptNumber } from './receipt-utils';
import { useUnit } from '@/i18n/use-unit';
import { useDistrictName } from '@/features/insurance/use-names';

/**
 * Opened by the QR on a printed receipt, by anyone, without signing in:
 * whether it is on WeGro's ledger and what it holds (never who owns it).
 */
export function VerifyReceiptPage({ id }: { id: string }) {
  const districtName = useDistrictName();
  const unitWord = useUnit();
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const query = useReceiptVerifyVerifyQuery({ id });
  const v = query.data?.data;
  const produce =
    v?.produce &&
    (i18n.resolvedLanguage === 'bn' && v.produce.nameBn
      ? v.produce.nameBn
      : v.produce.name);
  const done = v?.status === 'collected' || v?.status === 'sold_out';
  return (
    <AuthPage title={t('verifyReceipt.title')} intro={receiptNumber(id)}>
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
              <AlertTitle>{t('verifyReceipt.notGenuine')}</AlertTitle>
              <AlertDescription>
                {t('verifyReceipt.notGenuineText')}
              </AlertDescription>
            </Alert>
          ) : done || v.expired ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>
                {done ? t('verifyReceipt.closed') : t('verifyReceipt.expired')}
              </AlertTitle>
              <AlertDescription>
                {done
                  ? t('verifyReceipt.closedText')
                  : t('verifyReceipt.expiredText')}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-success/40 bg-success-soft text-success">
              <CircleCheck />
              <AlertTitle>{t('verifyReceipt.genuine')}</AlertTitle>
              <AlertDescription className="text-success">
                {t('verifyReceipt.genuineText')}
              </AlertDescription>
            </Alert>
          )}
          {v.genuine && (
            <dl className="divide-y text-sm">
              {produce && <Row label={t('warehouse.produce')}>{produce}</Row>}
              {v.quantity != null && v.produce && (
                <Row label={t('warehouse.held')}>
                  {t('warehouse.quantityOf', {
                    quantity: fmt.number(v.quantity),
                    // No catalog before sign-in: the record brings its Bengali unit.
                    unit: unitWord(v.produce.unit, v.produce.unitBn),
                  })}
                </Row>
              )}
              {v.site && (
                <Row
                  label={t('warehouse.site')}
                >{`${v.site.name}, ${districtName(v.site.district)}`}</Row>
              )}
              {v.status && (
                <Row label={t('verifyReceipt.status')}>
                  {t(`warehouse.status.${v.status}`)}
                </Row>
              )}
              {v.expiresOn && (
                <Row label={t('warehouse.expiresOn')}>
                  {fmt.date(v.expiresOn)}
                </Row>
              )}
              {v.issuedAt && (
                <Row label={t('warehouse.issuedAt')}>
                  {fmt.dateTime(v.issuedAt)}
                </Row>
              )}
              {v.partOfLargerReceipt && (
                <Row label={t('verifyReceipt.part')}>
                  {t('verifyReceipt.partText')}
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
