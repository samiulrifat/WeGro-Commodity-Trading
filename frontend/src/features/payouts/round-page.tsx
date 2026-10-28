import { Link } from '@tanstack/react-router';
import { ArrowLeft, Upload } from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { usePayoutSheetUploadMutation } from '@/api/files';
import {
  type PayoutLineDto,
  type RoundDto,
  useSettlementApproveMutation,
  useSettlementRecordPaymentMutation,
  useSettlementRejectMutation,
  useSettlementRoundQuery,
} from '@/api/generated/settlement';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { DownloadButton } from './download-button';
import { FRESH, payoutTotal } from './payouts-utils';
import { RoundKindPill, RoundStatusPill } from './status';
import { HistoryButton } from '@/features/audit/history-button';

type Move = 'approve' | 'reject' | 'upload';

/**
 * One payout round: the ledger's figures, who prepared and approved it,
 * each payee's line, and the moves: a second Accounts person approves or
 * sends it back; then each line is paid and its reference recorded, one
 * by one or by uploading the filled-in payout sheet.
 */
export function RoundPage({ id }: { id: number }) {
  const { t } = useTranslation();
  const query = useSettlementRoundQuery({ id }, FRESH);
  const back = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to="/payouts"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.sub.payoutRounds')}
      </Link>
      <HistoryButton type="round" id={String(id)} />
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
  const r = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header round={r} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Lines round={r} />
        </div>
        {/* On phones the moves come first. */}
        <div className="grid gap-6 max-lg:order-first">
          <Moves round={r} />
          <Figures round={r} />
          <History round={r} />
        </div>
      </div>
    </div>
  );
}

function Header({ round: r }: { round: RoundDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <span className="flex flex-wrap gap-1.5">
        <RoundStatusPill status={r.status} />
        <RoundKindPill isFinal={r.isFinal} />
        <StatusPill tone={r.verified ? 'success' : 'danger'} appearance="soft">
          {r.verified ? t('payouts.verified') : t('payouts.notVerified')}
        </StatusPill>
      </span>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">
          {t('payouts.roundNumber', { id: r.id })} · {fmt.taka(payoutTotal(r))}
        </h1>
        <Link
          to="/payouts/projects/$projectId"
          params={{ projectId: r.project.id }}
          className="inline-flex min-h-11 w-fit items-center font-semibold text-white hover:underline"
        >
          {r.project.name}
        </Link>
      </div>
      <p className="text-lg font-semibold">
        {t('payouts.paidOf', {
          paid: fmt.number(r.paidCount),
          count: r.payeeCount,
          total: fmt.number(r.payeeCount),
        })}
      </p>
    </section>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>
        {label}
      </dt>
      <dd
        className={
          strong ? 'text-right font-bold' : 'text-right font-medium break-all'
        }
      >
        {children}
      </dd>
    </div>
  );
}

function Figures({ round: r }: { round: RoundDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payouts.figures')}</CardTitle>
        <CardDescription>{t('payouts.figuresText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('payouts.income')}>{fmt.taka(r.income)}</Row>
          <Row label={t('payouts.costsTotal')}>{fmt.taka(r.costs)}</Row>
          <Row label={t('payouts.profitToSplit')} strong>
            {fmt.taka(r.profit)}
          </Row>
          <Row label={t('payouts.farmerShare')}>{fmt.taka(r.farmerShare)}</Row>
          <Row label={t('payouts.investorShare')}>
            {fmt.taka(r.investorShare)}
          </Row>
          <Row label={t('payouts.wegroShare')}>{fmt.taka(r.wegroShare)}</Row>
          {r.isFinal && (
            <Row label={t('payouts.capitalReturn')}>
              {fmt.taka(r.capitalReturn)}
            </Row>
          )}
          {r.leftover !== '0.00' && (
            <Row label={t('payouts.leftover')}>{fmt.taka(r.leftover)}</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function History({ round: r }: { round: RoundDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payouts.history')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          {t('payouts.preparedBy', {
            name: r.preparedBy.name,
            date: fmt.dateTime(r.preparedAt),
          })}
        </p>
        {r.approvedBy && r.approvedAt && (
          <p>
            {t('payouts.approvedBy', {
              name: r.approvedBy.name,
              date: fmt.dateTime(r.approvedAt),
            })}
          </p>
        )}
        {r.rejectedBy && r.rejectedAt && (
          <div className="rounded-lg bg-danger-soft p-3 text-danger">
            <p className="font-semibold">
              {t('payouts.rejectedBy', {
                name: r.rejectedBy.name,
                date: fmt.dateTime(r.rejectedAt),
              })}
            </p>
            {r.rejectReason && <p>{r.rejectReason}</p>}
          </div>
        )}
        {r.paidAt && (
          <p>{t('payouts.allPaidOn', { date: fmt.dateTime(r.paidAt) })}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Each role's moves at this status; the ledger checks them again. */
function Moves({ round: r }: { round: RoundDto }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  const [open, setOpen] = useState<Move | null>(null);
  const accounts = actsAs(user.role, 'accounts');
  const sheet =
    (user.role === 'super_admin' || user.role === 'accounts') &&
    (r.status === 'approved' || r.status === 'paid');
  const own = r.preparedBy.id === user.id;
  const moves: Move[] = [];
  if (accounts && r.status === 'prepared' && !own)
    moves.push('approve', 'reject');
  if (accounts && r.status === 'approved') moves.push('upload');
  if (moves.length === 0 && !sheet && !(accounts && r.status === 'prepared'))
    return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.manage')}</CardTitle>
        <CardDescription>
          {r.status === 'prepared' && own
            ? t('payouts.ownRound')
            : t(`payouts.roundManageText.${r.status}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {moves.includes('approve') && (
          <Button onClick={() => setOpen('approve')}>
            {t('payouts.approve')}
          </Button>
        )}
        {moves.includes('reject') && (
          <Button variant="outline" onClick={() => setOpen('reject')}>
            {t('payouts.sendBack')}
          </Button>
        )}
        {sheet && (
          <DownloadButton
            path={`/api/settlement/rounds/${r.id}/payout-sheet.csv`}
          >
            {t('payouts.payoutSheet')}
          </DownloadButton>
        )}
        {moves.includes('upload') && (
          <Button onClick={() => setOpen('upload')}>
            <Upload /> {t('payouts.uploadSheet')}
          </Button>
        )}
      </CardContent>
      {open === 'approve' && (
        <ApproveDialog round={r} onClose={() => setOpen(null)} />
      )}
      {open === 'reject' && (
        <RejectDialog round={r} onClose={() => setOpen(null)} />
      )}
      {open === 'upload' && (
        <UploadDialog round={r} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

function Lines({ round: r }: { round: RoundDto }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payouts.lines')}</CardTitle>
        <CardDescription>{t('payouts.linesText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {r.lines.map((l) => (
            <li key={l.payee.id}>
              <LineRow round={r} line={l} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LineRow({
  round: r,
  line: l,
}: {
  round: RoundDto;
  line: PayoutLineDto;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const [paying, setPaying] = useState(false);
  const canPay =
    actsAs(role, 'accounts') &&
    r.status === 'approved' &&
    !l.paid &&
    l.verified;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="grid min-w-0 gap-0.5">
        <p className="font-medium">{l.payee.name}</p>
        <p className="text-sm text-muted-foreground">
          {l.role ? t(`roles.${l.role}`) : ''}
          {l.slots != null && <> · {t('payouts.slots', { count: l.slots })}</>}
          {l.paid && l.paidAt && (
            <> · {t('payouts.paidOn', { date: fmt.date(l.paidAt) })}</>
          )}
          {l.paymentReference && <> · {l.paymentReference}</>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold">
          {l.amount ? fmt.taka(l.amount) : '—'}
        </span>
        {l.paid ? (
          <StatusPill tone="success" appearance="soft">
            {t('payouts.linePaid')}
          </StatusPill>
        ) : !l.verified ? (
          <StatusPill tone="danger" appearance="soft">
            {t('payouts.notVerified')}
          </StatusPill>
        ) : canPay ? (
          <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
            {t('payouts.recordPayment')}
          </Button>
        ) : (
          <StatusPill tone="neutral" appearance="soft">
            {t('payouts.lineUnpaid')}
          </StatusPill>
        )}
      </div>
      {paying && (
        <PayDialog round={r} line={l} onClose={() => setPaying(false)} />
      )}
    </div>
  );
}

function ApproveDialog({
  round: r,
  onClose,
}: {
  round: RoundDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [approve, approving] = useSettlementApproveMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await approve({ id: r.id }).unwrap();
      toast.success(t('payouts.approved'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payouts.approveTitle', { id: r.id })}</DialogTitle>
          <DialogDescription>
            {t('payouts.approveText', {
              amount: fmt.taka(payoutTotal(r)),
              count: r.payeeCount,
              payees: fmt.number(r.payeeCount),
            })}
          </DialogDescription>
        </DialogHeader>
        {!r.verified && (
          <Alert variant="destructive">
            <AlertDescription>{t('payouts.notVerifiedText')}</AlertDescription>
          </Alert>
        )}
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            disabled={approving.isLoading || !r.verified}
            onClick={() => void go()}
          >
            {approving.isLoading
              ? t('people.actions.working')
              : t('payouts.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  round: r,
  onClose,
}: {
  round: RoundDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reject, rejecting] = useSettlementRejectMutation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const empty = !reason.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (empty) return;
    setError(null);
    try {
      await reject({
        id: r.id,
        rejectRoundDto: { reason: reason.trim() },
      }).unwrap();
      toast.success(t('payouts.sentBack'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payouts.sendBackTitle', { id: r.id })}</DialogTitle>
          <DialogDescription>{t('payouts.sendBackText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="round-reason">
              {t('market.rejectReason')}
            </FieldLabel>
            <Textarea
              id="round-reason"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={(tried && empty) || undefined}
            />
            {tried && empty && (
              <FieldError>{t('payouts.required.reason')}</FieldError>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={rejecting.isLoading}
            >
              {rejecting.isLoading
                ? t('people.actions.working')
                : t('payouts.sendBack')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One line paid outside the app: its bank or mobile reference, kept encrypted. */
function PayDialog({
  round: r,
  line: l,
  onClose,
}: {
  round: RoundDto;
  line: PayoutLineDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [record, recording] = useSettlementRecordPaymentMutation();
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
        id: r.id,
        recordPayoutDto: { payeeId: l.payee.id, paymentReference: ref.trim() },
      }).unwrap();
      toast.success(t('payouts.paymentRecorded'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payouts.recordPayment')}</DialogTitle>
          <DialogDescription>
            {t('payouts.payText', {
              name: l.payee.name,
              amount: l.amount ? fmt.taka(l.amount) : '—',
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="line-reference">
              {t('market.reference')}
            </FieldLabel>
            <Input
              id="line-reference"
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
                : t('payouts.recordPayment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SheetProblem {
  line: number;
  problem: string;
}

/**
 * Uploading the payout sheet with its payment_reference column filled in.
 * The server checks it whole; if any row is wrong nothing is recorded and
 * each problem row is listed here.
 */
function UploadDialog({
  round: r,
  onClose,
}: {
  round: RoundDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [upload, uploading] = usePayoutSheetUploadMutation();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const problems =
    (error?.details?.problems as SheetProblem[] | undefined) ?? [];

  async function go() {
    if (!file) return;
    setError(null);
    try {
      const res = await upload({ id: r.id, body: { file } }).unwrap();
      toast.success(
        t('payouts.sheetRecorded', {
          count: res.data.recorded,
          recorded: fmt.number(res.data.recorded),
          blank: fmt.number(res.data.blank),
        }),
      );
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payouts.uploadSheet')}</DialogTitle>
          <DialogDescription>{t('payouts.uploadText')}</DialogDescription>
        </DialogHeader>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <Button variant="outline" onClick={() => input.current?.click()}>
          <Upload /> {file ? file.name : t('payouts.chooseSheet')}
        </Button>
        {problems.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-semibold">{t('payouts.sheetProblems')}</p>
              <ul className="mt-2 grid gap-1">
                {problems.map((p, i) => (
                  <li key={`${p.line}-${i}`}>
                    {t('payouts.sheetLine', { line: fmt.number(p.line) })}:{' '}
                    {t(`payouts.sheetProblem.${p.problem as 'format'}`)}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <FormError error={error} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            disabled={!file || uploading.isLoading}
            onClick={() => void go()}
          >
            {uploading.isLoading
              ? t('people.actions.working')
              : t('payouts.recordAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
