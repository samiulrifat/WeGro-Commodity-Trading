import { Link } from '@tanstack/react-router';
import { CircleAlert, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type DealProofDto,
  type OfferDto,
  useDealProofsAcceptMutation,
  useDealProofsForOfferQuery,
  useDealProofsRejectMutation,
} from '@/api/generated/marketplace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Amount, Banner, Proofs } from '@/features/projects/booking-page';
import { ReviewCard } from '@/features/projects/payments-queue';
import { toPoisha } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { useSecondsUntil } from '@/lib/use-seconds-until';
import { useAppSelector } from '@/store/hooks';
import { buysThis, produceName } from './market-utils';

/** The buyer's time to pay, stopped while a proof is reviewed. */
export function DealClock({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const seconds = useSecondsUntil(
    o.paymentDueAt ? Date.parse(o.paymentDueAt) : 0,
    Date.parse(o.madeAt),
  );
  if (o.status !== 'approved' || !o.paymentDueAt || o.overdue) return null;
  const left = (s: number) =>
    t('booking.hoursMinutes', {
      hours: fmt.number(Math.floor(s / 3600)),
      minutes: fmt.number(Math.floor((s % 3600) / 60)),
    });
  return o.onHold ? (
    <Banner
      tone="success"
      icon={<Hourglass />}
      title={t('booking.onHold')}
      text={t('booking.onHoldText', {
        left: left(o.pausedRemainingSeconds ?? 0),
      })}
    />
  ) : (
    <Banner
      tone="warning"
      icon={<CircleAlert />}
      title={t('booking.payWithin', { left: left(seconds) })}
      text={t('market.payWithinText', { at: o.paymentDueAt })}
    />
  );
}

/**
 * Where a deal's money stands, for the buyer and those who check payments
 * (only they are sent these figures): what is accepted, under review and
 * left, and each proof sent. Accounts decides proofs here too.
 */
export function DealPayment({ offer: o }: { offer: OfferDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const buying = buysThis(o, user);
  const sees = o.paid != null && o.underReview != null;
  const proofs = useDealProofsForOfferQuery({ id: o.id }, { skip: !sees });
  if (!sees || o.buyerPays == null) return null;
  const paid = toPoisha(o.paid!);
  const rows = proofs.data?.data ?? [];
  if (o.status !== 'approved' && rows.length === 0) return null;
  const total = toPoisha(o.buyerPays);
  const left = toPoisha(o.remaining ?? '0');
  const share = total === 0n ? 0 : Number((paid * 10_000n) / total) / 100;
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('booking.progress')}</CardTitle>
          <span className="font-bold text-brand">
            {t('booking.percent', { value: fmt.number(share, 0) })}
          </span>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Progress value={share} aria-label={t('booking.progress')} />
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Amount
              label={t('booking.paid')}
              value={fmt.taka(o.paid!)}
              tone="text-brand"
            />
            <Amount
              label={t('booking.underReview')}
              value={fmt.taka(o.underReview!)}
            />
            <Amount
              label={t('booking.remaining')}
              value={fmt.taka(o.remaining ?? '0')}
              tone={left > 0n ? 'text-danger' : undefined}
            />
          </dl>
          {buying && o.status === 'approved' && left > 0n && (
            <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-on-soft">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('market.stillToPay', { amount: fmt.taka(o.remaining!) })}
            </p>
          )}
        </CardContent>
      </Card>
      {buying ? (
        <Proofs loading={proofs.isLoading} proofs={rows} />
      ) : (
        rows.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">{t('market.dealProofs')}</h2>
            <ul className="grid gap-4">
              {rows.map((p) => (
                <li key={p.id}>
                  <DealProofCard proof={p} />
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </>
  );
}

/** One proof of a deal as Accounts checks it: whose, for what, and the decision. */
export function DealProofCard({ proof: p }: { proof: DealProofDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const [accept] = useDealProofsAcceptMutation();
  const [reject] = useDealProofsRejectMutation();
  return (
    <ReviewCard
      proof={p}
      total={p.dealTotal}
      heading={
        <>
          <span className="font-semibold">{p.buyer.fullName}</span>
          <Link
            to="/marketplace/deals/$offerId"
            params={{ offerId: String(p.offerId) }}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
          >
            {t('market.offerNumber', { id: p.offerId })} ·{' '}
            {produceName(p.produce, i18n.resolvedLanguage === 'bn')} ·{' '}
            {t('warehouse.quantityOf', {
              quantity: fmt.number(p.quantity),
              unit: p.produce.unit,
            })}
          </Link>
        </>
      }
      text={{
        accept: t('market.payments.acceptText'),
        reject: t('market.payments.rejectText'),
        rejected: t('market.payments.rejected'),
      }}
      onAccept={(paymentReference) =>
        accept({ id: p.id, acceptProofDto: { paymentReference } }).unwrap()
      }
      onReject={(reason) =>
        reject({ id: p.id, rejectProofDto: { reason } }).unwrap()
      }
    />
  );
}
