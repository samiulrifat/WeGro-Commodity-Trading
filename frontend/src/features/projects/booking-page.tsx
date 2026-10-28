import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Copy,
  FileText,
  Hourglass,
  Landmark,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { usePaymentAccountsInUseQuery } from '@/api/generated/payment-accounts';
import {
  type PaymentProofDto,
  usePaymentProofsForReservationQuery,
} from '@/api/generated/payment-proofs';
import {
  type ReservationDto,
  useProjectsFindOneQuery,
  useReservationsCancelMutation,
  useReservationsFindOneQuery,
} from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/use-format';
import { useSecondsUntil } from '@/lib/use-seconds-until';
import { ProofFileLink } from './proof-file-link';
import { ProjectPhoto } from './project-card';
import { toPoisha } from './project-math';
import { ProofDialog } from './proof-dialog';

/**
 * Paying for a booking, as in WeGro's app: the time left (stopped while a
 * proof is reviewed), what is paid and left, WeGro's account to transfer to,
 * the proofs sent and their outcome, uploading another, and cancelling while
 * nothing was sent.
 */
export function BookingPage({ id }: { id: number }) {
  const { t } = useTranslation();
  const query = useReservationsFindOneQuery({ id });
  const back = (
    <Link
      to="/holdings"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t('nav.holdings')}
    </Link>
  );
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-6 pb-36">
      {back}
      <Booking reservation={query.data.data} />
    </div>
  );
}

function Booking({ reservation: r }: { reservation: ReservationDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const project = useProjectsFindOneQuery({ id: r.projectId }).data?.data;
  const proofs = usePaymentProofsForReservationQuery({ id: r.id });
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pending = r.status === 'pending';
  const sentNothing = toPoisha(r.paid) === 0n && toPoisha(r.underReview) === 0n;
  const left = toPoisha(r.remaining);
  const paidShare =
    toPoisha(r.amount) === 0n
      ? 0
      : Number((toPoisha(r.paid) * 10_000n) / toPoisha(r.amount)) / 100;

  return (
    <>
      <PageHeader title={t('booking.title')} description={r.projectTitle} />
      <Clock reservation={r} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card>
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-4">
                {project && (
                  <ProjectPhoto
                    project={project}
                    className="size-16 shrink-0 rounded-xl"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.projectTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('projects.unitsWord', { count: r.slots })}
                    {project &&
                      ` · ${t('projects.months', { count: project.durationMonths })}`}
                  </p>
                </div>
                {project && (
                  <p className="shrink-0 font-semibold text-brand">
                    {t('projects.perUnitPrice', {
                      price: fmt.takaShort(project.slotPrice),
                    })}
                  </p>
                )}
              </div>
              <div className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3">
                <span className="font-medium">{t('booking.total')}</span>
                <span className="text-xl font-bold text-brand">
                  {fmt.taka(r.amount)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t('booking.progress')}</CardTitle>
              <span className="font-bold text-brand">
                {t('booking.percent', { value: fmt.number(paidShare, 0) })}
              </span>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Progress value={paidShare} aria-label={t('booking.progress')} />
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Amount
                  label={t('booking.paid')}
                  value={fmt.taka(r.paid)}
                  tone="text-brand"
                />
                <Amount
                  label={t('booking.underReview')}
                  value={fmt.taka(r.underReview)}
                />
                <Amount
                  label={t('booking.remaining')}
                  value={fmt.taka(r.remaining)}
                  tone={left > 0n ? 'text-danger' : undefined}
                />
              </dl>
              {pending && left > 0n && (
                <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-on-soft">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('booking.stillToPay', { amount: fmt.taka(r.remaining) })}
                </p>
              )}
            </CardContent>
          </Card>

          <Proofs loading={proofs.isLoading} proofs={proofs.data?.data ?? []} />
        </div>

        {pending && <PayTo amount={r.remaining} />}
      </div>

      {pending && (
        <div className="fixed inset-x-0 bottom-16 z-30 grid gap-2 border-t bg-background/95 p-4 backdrop-blur md:bottom-0 md:left-auto md:w-[28rem] md:rounded-tl-2xl md:border-l">
          {left > 0n && (
            <Button className="min-h-12" onClick={() => setUploading(true)}>
              <Upload /> {t('booking.upload')}
            </Button>
          )}
          {sentNothing && (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => setCancelling(true)}
            >
              {t('booking.cancel')}
            </Button>
          )}
        </div>
      )}
      {uploading && (
        <ProofDialog reservation={r} onClose={() => setUploading(false)} />
      )}
      {cancelling && (
        <CancelDialog reservation={r} onClose={() => setCancelling(false)} />
      )}
    </>
  );
}

function Amount({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-lg font-bold ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

/** Time left to pay, stopped while a proof is reviewed; or how the booking ended. */
function Clock({ reservation: r }: { reservation: ReservationDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const seconds = useSecondsUntil(
    Date.parse(r.expiresAt),
    Date.parse(r.reservedAt),
  );
  const left = (s: number) =>
    t('booking.hoursMinutes', {
      hours: fmt.number(Math.floor(s / 3600)),
      minutes: fmt.number(Math.floor((s % 3600) / 60)),
    });
  if (r.status === 'confirmed') {
    return (
      <Banner
        tone="success"
        icon={<CircleCheck />}
        title={t('booking.confirmed')}
        text={t('booking.confirmedText')}
      />
    );
  }
  if (r.status !== 'pending') {
    return (
      <Banner
        tone="neutral"
        icon={<Hourglass />}
        title={t(`booking.ended.${r.status}`)}
        text={
          toPoisha(r.paid) > 0n
            ? t('booking.refundDue')
            : t('booking.endedText')
        }
      />
    );
  }
  if (r.onHold) {
    return (
      <Banner
        tone="success"
        icon={<Hourglass />}
        title={t('booking.onHold')}
        text={t('booking.onHoldText', {
          left: left(r.pausedRemainingSeconds ?? 0),
        })}
      />
    );
  }
  return (
    <Banner
      tone="warning"
      icon={<CircleAlert />}
      title={t('booking.payWithin', { left: left(seconds) })}
      text={t('booking.payWithinText', { at: r.expiresAt })}
    />
  );
}

function Banner({
  tone,
  icon,
  title,
  text,
}: {
  tone: 'warning' | 'success' | 'neutral';
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  const style = {
    warning: 'bg-wegro-amber text-white',
    success: 'bg-success-soft text-success',
    neutral: 'bg-muted text-foreground',
  }[tone];
  return (
    <output
      className={`flex gap-3 rounded-2xl p-4 [&_svg]:size-5 [&_svg]:shrink-0 ${style}`}
    >
      {icon}
      <div className="grid gap-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-sm opacity-90">{text}</p>
      </div>
    </output>
  );
}

/** WeGro's accounts with copy buttons, and the exact amount to send. */
function PayTo({ amount }: { amount: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const accounts = usePaymentAccountsInUseQuery().data?.data ?? [];
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2 bg-ink px-5 py-4 text-white">
        <Landmark aria-hidden className="size-5" />
        <h2 className="font-semibold">{t('booking.payTo')}</h2>
      </div>
      <CardContent className="grid gap-5 py-5">
        {accounts.length === 0 && (
          <p className="text-muted-foreground">{t('booking.noAccounts')}</p>
        )}
        {accounts.map((a) => (
          <dl key={a.id} className="grid divide-y rounded-lg border">
            <CopyRow label={t('bank.bank')} value={a.bankName} />
            <CopyRow label={t('bank.holder')} value={a.accountName} />
            <CopyRow label={t('bank.account')} value={a.accountNumber} mono />
            <CopyRow label={t('bank.routing')} value={a.routingNumber} mono />
            <CopyRow label={t('bank.branch')} value={a.branchName} />
          </dl>
        ))}
        <div className="flex items-baseline justify-between rounded-lg bg-success-soft px-4 py-3 text-success">
          <span className="font-semibold">{t('booking.exactAmount')}</span>
          <span className="text-xl font-bold">{fmt.taka(amount)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('booking.copied', { what: label }));
    } catch {
      toast.error(t('booking.copyFailed'));
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd
          className={`font-semibold break-all ${mono ? 'font-mono tracking-wide' : ''}`}
        >
          {value}
        </dd>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={t('booking.copyWhat', { what: label })}
        onClick={() => void copy()}
      >
        <Copy /> {t('booking.copy')}
      </Button>
    </div>
  );
}

const PROOF_TONE = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
} as const;

/** What the investor sent, and what Accounts decided. */
function Proofs({
  loading,
  proofs,
}: {
  loading: boolean;
  proofs: PaymentProofDto[];
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (loading || proofs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('booking.proofs')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4">
          {proofs.map((p) => (
            <li key={p.id} className="grid gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-bold">{fmt.taka(p.amount)}</span>
                <StatusPill tone={PROOF_TONE[p.status]} appearance="soft">
                  {t(`booking.proofStatus.${p.status}`)}
                </StatusPill>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(`booking.method.${p.method}`)}
                {p.bankName && ` · ${p.bankName}`}
                {p.branchName && `, ${p.branchName}`}
                {' · '}
                {fmt.date(p.transferredOn)}
                {p.reference && ` · ${p.reference}`}
              </p>
              {p.rejectionReason && (
                <p className="text-sm text-danger">
                  {t('bank.reason', { reason: p.rejectionReason })}
                </p>
              )}
              {p.refund !== 'none' && (
                <p className="text-sm">{t(`booking.refund.${p.refund}`)}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {p.files.map((f, i) => (
                  <ProofFileLink key={f.id} file={f} index={i}>
                    <FileText /> {t('booking.file', { n: i + 1 })}
                  </ProofFileLink>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CancelDialog({
  reservation: r,
  onClose,
}: {
  reservation: ReservationDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [cancel, cancelling] = useReservationsCancelMutation();
  const [error, setError] = useState<ApiError | null>(null);
  async function go() {
    setError(null);
    try {
      await cancel({ id: r.id }).unwrap();
      toast.success(t('booking.cancelled'));
      onClose();
      void navigate({ to: '/holdings' });
    } catch (e) {
      setError(toApiError(e as never));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <span className="mb-2 flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Trash2 />
          </span>
          <DialogTitle>{t('booking.cancelTitle')}</DialogTitle>
          <DialogDescription>
            {t('booking.cancelText', { title: r.projectTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning-on-soft">
          <p className="mb-2 font-semibold">{t('booking.whatHappens')}</p>
          <ul className="list-disc pl-5">
            <li>{t('booking.released', { amount: fmt.taka(r.amount) })}</li>
            <li>{t('booking.nothingCharged')}</li>
            <li>{t('booking.rebook')}</li>
          </ul>
        </div>
        <FormError error={error} />
        <DialogFooter className="sm:flex-col sm:gap-2">
          <Button className="w-full" onClick={onClose}>
            {t('booking.keep')}
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            disabled={cancelling.isLoading}
            onClick={() => void go()}
          >
            {cancelling.isLoading
              ? t('people.actions.working')
              : t('booking.confirmCancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
