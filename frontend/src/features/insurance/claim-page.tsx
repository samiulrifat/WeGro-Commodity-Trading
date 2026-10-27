import { skipToken } from '@reduxjs/toolkit/query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ImageOff } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type ClaimDto,
  useInsuranceApproveMutation,
  useInsuranceClaimQuery,
  useInsuranceCoverageQuery,
  useInsuranceRecordPaymentMutation,
  useInsuranceRejectMutation,
  useInsuranceStartReviewMutation,
} from '@/api/generated/insurance';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { PhotoPicker } from '@/components/photo-picker';
import { ErrorState, LoadingState } from '@/components/states';
import { StepIcon } from '@/components/step-icon';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toPoisha, typedTaka } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { usePhotoPicks } from '@/lib/use-photo-picks';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { FRESH, type Severity, typedPercent } from './insurance-utils';
import { ClaimStatusPill, SeverityPill } from './status';
import { useDistrictName, useEventTypeName } from './use-names';
import { HistoryButton } from '@/features/audit/history-button';

type Move = 'review' | 'approve' | 'reject' | 'payment';
const STEPS = ['opened', 'under_review', 'approved', 'paid'] as const;
const REACHED: Record<ClaimDto['status'], number> = {
  submitted: -1,
  triggered: 0,
  under_review: 1,
  approved: 2,
  paid: 3,
  rejected: -1,
};

/**
 * One claim: the event and damage the officer reported with photos, the
 * insurer's assessment, the money, the steps, and each role's moves.
 */
export function ClaimPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const query = useInsuranceClaimQuery({ id }, FRESH);
  const back = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to="/insurance/claims"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.sub.claims')}
      </Link>
      <HistoryButton type="claim" id={id} />
    </div>
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
  const c = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header claim={c} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Reported claim={c} />
          <Assessment claim={c} />
        </div>
        {/* On phones the moves come first, before the details. */}
        <div className="grid gap-6 max-lg:order-first">
          <Moves claim={c} />
          <Money claim={c} />
          <Progress claim={c} />
        </div>
      </div>
    </div>
  );
}

function Header({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const eventName = useEventTypeName();
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <span className="flex flex-wrap gap-1.5">
        <ClaimStatusPill claim={c} />
      </span>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {eventName(c.event.eventType)} ·{' '}
          {t('insurance.damage', { percent: fmt.number(c.damagePercent, 1) })}
        </h1>
        <Link
          to="/insurance/projects/$projectId"
          params={{ projectId: c.project.id }}
          className="w-fit font-semibold text-white hover:underline"
        >
          {c.project.name}
        </Link>
      </div>
      <p className="text-white/85">
        {t('insurance.openedBy', { name: c.openedBy.name })}
        {c.openedAt && <> · {fmt.dateTime(c.openedAt)}</>}
        {c.insurer && (
          <>
            {' · '}
            {t('insurance.insurer')}:{' '}
            <span className="font-semibold text-white">{c.insurer.name}</span>
          </>
        )}
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{children}</dd>
    </div>
  );
}

function ClaimPhoto({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const { url, error } = useApiFile(path);
  return url ? (
    <img
      src={url}
      alt={alt}
      className={cn('rounded-xl bg-muted object-contain', className)}
    />
  ) : (
    <div
      className={cn(
        'grid place-items-center rounded-xl bg-muted text-muted-foreground',
        !error && 'animate-pulse',
        className,
      )}
    >
      {error && <ImageOff aria-hidden className="size-6" />}
    </div>
  );
}

/** What the officer reported: the event, the damage, what happened, photos. */
function Reported({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const district = useDistrictName();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.reported')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="divide-y">
          <Row label={t('insurance.weatherEvent')}>
            <span className="flex flex-wrap items-center justify-end gap-2">
              {district(c.event.district)} · {fmt.date(c.event.occurredOn)}
              <SeverityPill severity={c.event.severity as Severity} />
            </span>
          </Row>
          <Row label={t('insurance.damageSeen')}>
            {fmt.number(c.damagePercent, 1)}%
          </Row>
        </dl>
        <p translate="no" className="whitespace-pre-line">
          {c.notes}
        </p>
        {c.event.notes && (
          <p translate="no" className="text-sm text-muted-foreground">
            <span className="font-semibold">{t('insurance.eventNotes')}: </span>
            {c.event.notes}
          </p>
        )}
        {c.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {c.photos.map((p, i) => (
              <ClaimPhoto
                key={p}
                path={p}
                alt={t('insurance.photoAlt', { n: i + 1 })}
                className="aspect-square w-full"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Assessment({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const a = c.assessment;
  if (!a) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.assessment')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {a.damagePercent && (
          <dl className="divide-y">
            <Row label={t('insurance.damageFound')}>
              {fmt.number(a.damagePercent, 1)}%
            </Row>
          </dl>
        )}
        <p translate="no" className="whitespace-pre-line">
          {a.notes}
        </p>
        {a.photoUrl && (
          <ClaimPhoto
            path={a.photoUrl}
            alt={t('insurance.assessmentPhotoAlt')}
            className="max-h-80 w-full"
          />
        )}
      </CardContent>
    </Card>
  );
}

function Money({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (!c.approvedAmount) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.money')}</CardTitle>
        {c.status === 'approved' && (
          <CardDescription>{t('insurance.paymentDueText')}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('insurance.approvedAmount')}>
            <span className="font-bold">{fmt.taka(c.approvedAmount)}</span>
          </Row>
          {c.decidedAt && (
            <Row label={t('insurance.decidedAt')}>
              {fmt.dateTime(c.decidedAt)}
            </Row>
          )}
          {c.paidAt && (
            <Row label={t('insurance.paidAt')}>{fmt.dateTime(c.paidAt)}</Row>
          )}
          {c.paymentReference && (
            <Row label={t('market.paymentReference')}>{c.paymentReference}</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Progress({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const reached = REACHED[c.status];
  const rejected = c.status === 'rejected';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.progress')}</CardTitle>
        {rejected && (
          <CardDescription>{t('insurance.rejectedText')}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {STEPS.map((s, i) => {
            const state = rejected
              ? i === 0
                ? 'done'
                : null
              : i <= reached
                ? 'done'
                : i === reached + 1
                  ? 'waiting'
                  : null;
            return (
              <li key={s} className="flex items-center gap-3">
                {state ? (
                  <StepIcon state={state} label={t(`insurance.step.${s}`)} />
                ) : (
                  <span
                    aria-hidden
                    className="ml-0.5 size-4 rounded-full border-2"
                  />
                )}
                <span
                  className={cn(
                    'text-sm',
                    state === 'done'
                      ? 'font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(`insurance.step.${s}`)}
                </span>
              </li>
            );
          })}
          {rejected && (
            <li className="flex items-center gap-3">
              <StepIcon state="refused" label={t('insurance.step.rejected')} />
              <span className="text-sm font-semibold">
                {t('insurance.step.rejected')}
              </span>
            </li>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Each role's moves at this status; the ledger checks them again. */
function Moves({ claim: c }: { claim: ClaimDto }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  const [open, setOpen] = useState<Move | null>(null);
  const insurer = user.role === 'insurer' && c.insurer?.id === user.id;
  const moves: Move[] = [];
  if (insurer && c.status === 'triggered') moves.push('review', 'reject');
  if (insurer && c.status === 'under_review') moves.push('approve', 'reject');
  if (actsAs(user.role, 'accounts') && c.status === 'approved')
    moves.push('payment');
  if (moves.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.manage')}</CardTitle>
        <CardDescription>
          {t(`insurance.claimManageText.${c.status as 'triggered'}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {moves.map((m) => (
          <Button
            key={m}
            variant={m === 'reject' ? 'outline' : 'default'}
            onClick={() => setOpen(m)}
          >
            {t(`insurance.claimMove.${m}`)}
          </Button>
        ))}
      </CardContent>
      {open === 'review' && (
        <ReviewDialog claim={c} onClose={() => setOpen(null)} />
      )}
      {(open === 'approve' || open === 'reject') && (
        <DecideDialog claim={c} move={open} onClose={() => setOpen(null)} />
      )}
      {open === 'payment' && (
        <PaymentDialog claim={c} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

function ReviewDialog({
  claim: c,
  onClose,
}: {
  claim: ClaimDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [review, reviewing] = useInsuranceStartReviewMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await review({ id: c.id }).unwrap();
      toast.success(t('insurance.claimMoved.review'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('insurance.claimMove.review')}</DialogTitle>
          <DialogDescription>{t('insurance.reviewText')}</DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button disabled={reviewing.isLoading} onClick={() => void go()}>
            {reviewing.isLoading
              ? t('people.actions.working')
              : t('insurance.claimMove.review')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The insurer decides with an assessment: what they found, a photo if they
 * like, and for an approval the amount, within the cover still remaining.
 */
function DecideDialog({
  claim: c,
  move,
  onClose,
}: {
  claim: ClaimDto;
  move: 'approve' | 'reject';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const cover = useInsuranceCoverageQuery(
    move === 'approve' ? { projectId: c.project.id } : skipToken,
    FRESH,
  );
  const [approve, approving] = useInsuranceApproveMutation();
  const [reject, rejecting] = useInsuranceRejectMutation();
  const picks = usePhotoPicks(1);
  const [amount, setAmount] = useState('');
  const [damage, setDamage] = useState('');
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const remaining = cover.data?.data.remaining;
  const taka = typedTaka(amount);
  const percent = damage.trim() ? typedPercent(damage) : undefined;
  const missing = {
    amount:
      move === 'approve' &&
      (!taka ||
        toPoisha(taka) <= 0n ||
        (remaining !== undefined && toPoisha(taka) > toPoisha(remaining))),
    damage: percent === null,
    notes: !notes.trim(),
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const busy = approving.isLoading || rejecting.isLoading || picks.uploading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (picks.uploading || Object.values(missing).some(Boolean)) return;
    setError(null);
    const assessment = {
      notes: notes.trim(),
      ...(percent ? { damagePercent: percent } : {}),
      ...(picks.ids[0] ? { photoId: picks.ids[0] } : {}),
    };
    try {
      if (move === 'approve') {
        await approve({
          id: c.id,
          approveClaimDto: { ...assessment, amount: taka! },
        }).unwrap();
      } else {
        await reject({ id: c.id, assessmentDto: assessment }).unwrap();
      }
      toast.success(t(`insurance.claimMoved.${move}`));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`insurance.claimMove.${move}`)}</DialogTitle>
          <DialogDescription>
            {t(`insurance.decideText.${move}`)}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          {move === 'approve' && (
            <Field data-invalid={show('amount') || undefined}>
              <FieldLabel htmlFor="claim-amount">
                {t('insurance.approvedAmount')}
              </FieldLabel>
              <Input
                id="claim-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={show('amount') || undefined}
              />
              {show('amount') ? (
                <FieldError>
                  {t('insurance.required.approvedAmount', {
                    remaining: remaining ? fmt.taka(remaining) : '—',
                  })}
                </FieldError>
              ) : (
                remaining && (
                  <FieldDescription>
                    {t('insurance.remainingHint', {
                      remaining: fmt.taka(remaining),
                    })}
                  </FieldDescription>
                )
              )}
            </Field>
          )}
          <Field data-invalid={show('damage') || undefined}>
            <FieldLabel htmlFor="claim-found">
              {t('insurance.damageFound')}
            </FieldLabel>
            <Input
              id="claim-found"
              inputMode="decimal"
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              aria-invalid={show('damage') || undefined}
            />
            {show('damage') ? (
              <FieldError>{t('insurance.required.damageFound')}</FieldError>
            ) : (
              <FieldDescription>
                {t('insurance.damageFoundHint', {
                  percent: fmt.number(c.damagePercent, 1),
                })}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={show('notes') || undefined}>
            <FieldLabel htmlFor="claim-findings">
              {t('insurance.findings')}
            </FieldLabel>
            <Textarea
              id="claim-findings"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-invalid={show('notes') || undefined}
            />
            {show('notes') && (
              <FieldError>{t('insurance.required.findings')}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel>{t('insurance.assessmentPhoto')}</FieldLabel>
            <PhotoPicker picks={picks} />
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button
              type="submit"
              variant={move === 'reject' ? 'destructive' : 'default'}
              disabled={busy}
            >
              {busy
                ? t('people.actions.working')
                : t(`insurance.claimMove.${move}`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Accounts records that the insurer's payment reached WeGro. The reference
 * is kept encrypted; the ledger keeps only its fingerprint.
 */
function PaymentDialog({
  claim: c,
  onClose,
}: {
  claim: ClaimDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [record, recording] = useInsuranceRecordPaymentMutation();
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const empty = !ref.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (empty) return;
    setError(null);
    try {
      await record({
        id: c.id,
        paymentReferenceDto: { paymentReference: ref.trim() },
      }).unwrap();
      toast.success(t('insurance.claimMoved.payment'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('insurance.claimMove.payment')}</DialogTitle>
          <DialogDescription>
            {t('insurance.paymentText', {
              amount: fmt.taka(c.approvedAmount ?? '0'),
              insurer: c.insurer?.name ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="claim-reference">
              {t('market.reference')}
            </FieldLabel>
            <Input
              id="claim-reference"
              maxLength={128}
              autoComplete="off"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              aria-invalid={(tried && empty) || undefined}
            />
            {tried && empty ? (
              <FieldError>{t('market.required.reference')}</FieldError>
            ) : (
              <FieldDescription>{t('market.referenceHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={recording.isLoading}>
              {recording.isLoading
                ? t('people.actions.working')
                : t('insurance.claimMove.payment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
