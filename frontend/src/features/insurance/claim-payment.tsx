import { Link } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type ClaimDto,
  type ClaimProofDto,
  useClaimProofsAcceptMutation,
  useClaimProofsForClaimQuery,
  useClaimProofsRejectMutation,
} from '@/api/generated/insurance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Amount, Proofs } from '@/features/projects/booking-page';
import { ReviewCard } from '@/features/projects/payments-queue';
import { toPoisha } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { paysThis } from './insurance-utils';

/**
 * Where an approved claim's money stands, for its insurer and those who
 * check payments (only they are sent these figures): what is accepted,
 * under review and left, and each proof sent. Accounts decides proofs here
 * too.
 */
export function ClaimPayment({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const paying = paysThis(c, user.id);
  const sees = c.paid != null && c.underReview != null;
  const proofs = useClaimProofsForClaimQuery({ id: c.id }, { skip: !sees });
  if (!sees || !c.approvedAmount) return null;
  const rows = proofs.data?.data ?? [];
  if (c.status !== 'approved' && rows.length === 0) return null;
  const total = toPoisha(c.approvedAmount);
  const paid = toPoisha(c.paid!);
  const left = toPoisha(c.remaining ?? '0');
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
              value={fmt.taka(c.paid!)}
              tone="text-brand"
            />
            <Amount
              label={t('booking.underReview')}
              value={fmt.taka(c.underReview!)}
            />
            <Amount
              label={t('booking.remaining')}
              value={fmt.taka(c.remaining ?? '0')}
              tone={left > 0n ? 'text-danger' : undefined}
            />
          </dl>
          {paying && c.status === 'approved' && left > 0n && (
            <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-on-soft">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('insurance.stillToPay', { amount: fmt.taka(c.remaining!) })}
            </p>
          )}
        </CardContent>
      </Card>
      {paying ? (
        <Proofs loading={proofs.isLoading} proofs={rows} />
      ) : (
        rows.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">
              {t('insurance.payments.proofs')}
            </h2>
            <ul className="grid gap-4">
              {rows.map((p) => (
                <li key={p.id}>
                  <ClaimProofCard proof={p} />
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </>
  );
}

/** One proof of a claim as Accounts checks it: whose, for what, and the decision. */
export function ClaimProofCard({ proof: p }: { proof: ClaimProofDto }) {
  const { t } = useTranslation();
  const [accept] = useClaimProofsAcceptMutation();
  const [reject] = useClaimProofsRejectMutation();
  return (
    <ReviewCard
      proof={p}
      total={p.claimTotal}
      heading={
        <>
          <span className="font-semibold">{p.insurer.fullName}</span>
          <Link
            to="/insurance/claims/$claimId"
            params={{ claimId: p.claimId }}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
          >
            {t('insurance.payments.claimOn', { project: p.project.name })}
          </Link>
        </>
      }
      text={{
        accept: t('insurance.payments.acceptText'),
        reject: t('insurance.payments.rejectText'),
        rejected: t('insurance.payments.rejected'),
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
