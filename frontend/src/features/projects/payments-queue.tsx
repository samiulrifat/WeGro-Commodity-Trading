import { Link, useNavigate } from '@tanstack/react-router';
import { BadgeCheck, FileText, Receipt, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type PaymentProofDto,
  usePaymentProofsListQuery,
} from '@/api/generated/payment-proofs';
import {
  type ReservationDto,
  useReservationsConfirmMutation,
  useReservationsListQuery,
} from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  usePaymentProofsAcceptMutation,
  usePaymentProofsRejectMutation,
} from './api';
import { toPoisha } from './project-math';
import { ProofFileLink } from './proof-file-link';
import { PAYMENT_TABS as TABS, type PaymentsSearch } from './projects-search';

const PAGE_SIZE = 20;
/**
 * Accounts' review of payments: proofs waiting (oldest first), decided ones,
 * and bookings awaiting payment (confirmed outright when paid without a
 * proof). Searched by the investor's name words, number or NID.
 */
export function PaymentsQueue({ search }: { search: PaymentsSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tab = search.tab ?? 'pending';
  const set = (patch: Partial<PaymentsSearch>) =>
    void navigate({
      to: '/projects/payments',
      search: { ...search, ...patch, page: undefined },
    });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.paymentConfirmations')}
        description={t('payments.intro')}
      />
      <div
        role="tablist"
        aria-label={t('payments.tabs')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => set({ tab: x === 'pending' ? undefined : x })}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(`payments.tab.${x}`)}
          </button>
        ))}
      </div>
      <SearchBox
        key={tab}
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q })}
        placeholder={t('payments.search')}
      />
      {tab === 'bookings' ? (
        <Bookings
          search={search}
          onPage={(page) =>
            void navigate({
              to: '/projects/payments',
              search: { ...search, page },
            })
          }
        />
      ) : (
        <Proofs
          status={tab}
          search={search}
          onPage={(page) =>
            void navigate({
              to: '/projects/payments',
              search: { ...search, page },
            })
          }
        />
      )}
    </div>
  );
}

function Proofs({
  status,
  search,
  onPage,
}: {
  status: 'pending' | 'accepted' | 'rejected';
  search: PaymentsSearch;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const page = search.page ?? 1;
  const query = usePaymentProofsListQuery({
    status,
    q: search.q,
    page,
    limit: PAGE_SIZE,
  });
  const meta = query.data?.meta;
  if (query.isLoading) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data?.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={search.q ? t('people.noMatch') : t(`payments.none.${status}`)}
        description={search.q ? t('people.noMatchHint') : undefined}
      />
    );
  }
  return (
    <>
      <ul className="grid gap-4 xl:grid-cols-2">
        {rows.map((p) => (
          <li key={p.id}>
            <ProofCard proof={p} />
          </li>
        ))}
      </ul>
      {meta && (
        <Pager
          page={page}
          pages={meta.totalPages}
          total={meta.total}
          onPage={onPage}
        />
      )}
    </>
  );
}

const TONE = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
} as const;

/** One proof: whose, for what, how sent, the files, and the decision. */
export function ProofCard({ proof: p }: { proof: PaymentProofDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const [open, setOpen] = useState<'accept' | 'reject' | null>(null);
  const decides = role === 'accounts' && p.status === 'pending';
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <Link
            to="/people/$personId"
            params={{ personId: p.investor.id }}
            className="font-semibold hover:underline"
          >
            {p.investor.fullName}
          </Link>
          <Link
            to="/projects/$projectId"
            params={{ projectId: p.projectId }}
            className="text-sm text-muted-foreground hover:underline"
          >
            {t('holdings.bookingNo', { id: fmt.number(p.reservationId) })} ·{' '}
            {p.projectTitle}
          </Link>
        </div>
        <StatusPill tone={TONE[p.status]} appearance="soft">
          {t(`booking.proofStatus.${p.status}`)}
        </StatusPill>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">
            {t('booking.amount')}
          </dt>
          <dd className="text-lg font-bold">{fmt.taka(p.amount)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">
            {t('booking.total')}
          </dt>
          <dd className="font-medium">{fmt.taka(p.reservationAmount)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">
            {t('booking.methodLabel')}
          </dt>
          <dd className="font-medium">
            {t(`booking.method.${p.method}`)}
            {p.bankName && (
              <span className="block text-sm font-normal text-muted-foreground">
                {p.bankName}
              </span>
            )}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">{t('booking.date')}</dt>
          <dd className="font-medium">{fmt.date(p.transferredOn)}</dd>
        </div>
      </dl>
      {(p.reference || p.note) && (
        <p className="text-sm">
          {p.reference && <span className="font-mono">{p.reference}</span>}
          {p.reference && p.note && ' · '}
          {p.note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {p.files.map((f, i) => (
          <ProofFileLink key={f.id} file={f} index={i}>
            <FileText /> {t('booking.file', { n: i + 1 })}
          </ProofFileLink>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {t('payments.submitted', { at: p.submittedAt })}
        {p.decided.by &&
          p.decided.at &&
          ` · ${t(p.status === 'rejected' ? 'payments.rejectedBy' : 'payments.acceptedBy', { name: p.decided.by.fullName, at: p.decided.at })}`}
      </p>
      {p.verifiedReference && (
        <p className="text-sm">
          {t('payments.statementRef')}:{' '}
          <span className="font-mono">{p.verifiedReference}</span>
        </p>
      )}
      {p.rejectionReason && (
        <p className="text-sm text-danger">
          {t('bank.reason', { reason: p.rejectionReason })}
        </p>
      )}
      {decides && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen('accept')}>
            <BadgeCheck /> {t('payments.accept')}
          </Button>
          <Button variant="destructive" onClick={() => setOpen('reject')}>
            <X /> {t('payments.reject')}
          </Button>
        </div>
      )}
      {open === 'accept' && (
        <AcceptDialog proof={p} onClose={() => setOpen(null)} />
      )}
      {open === 'reject' && (
        <RejectDialog proof={p} onClose={() => setOpen(null)} />
      )}
    </article>
  );
}

function AcceptDialog({
  proof: p,
  onClose,
}: {
  proof: PaymentProofDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [accept, accepting] = usePaymentProofsAcceptMutation();
  const [ref, setRef] = useState(p.reference ?? '');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const empty = ref.trim() === '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (empty) return;
    setError(null);
    try {
      await accept({
        id: p.id,
        acceptProofDto: { paymentReference: ref.trim() },
      }).unwrap();
      toast.success(t('payments.accepted', { amount: fmt.taka(p.amount) }));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('payments.acceptTitle', { amount: fmt.taka(p.amount) })}
          </DialogTitle>
          <DialogDescription>{t('payments.acceptText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="accept-ref">
              {t('payments.statementRef')}
            </FieldLabel>
            <Input
              id="accept-ref"
              maxLength={128}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="font-mono"
            />
            {tried && empty ? (
              <FieldError>{t('payments.refRequired')}</FieldError>
            ) : (
              <FieldDescription>{t('payments.refHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={accepting.isLoading}>
              {accepting.isLoading
                ? t('people.actions.working')
                : t('payments.accept')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  proof: p,
  onClose,
}: {
  proof: PaymentProofDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reject, rejecting] = usePaymentProofsRejectMutation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const short = reason.trim().length < 3;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (short) return;
    setError(null);
    try {
      await reject({
        id: p.id,
        rejectProofDto: { reason: reason.trim() },
      }).unwrap();
      toast.success(t('payments.rejected'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payments.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('payments.rejectText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && short) || undefined}>
            <FieldLabel htmlFor="reject-proof-reason">
              {t('bank.rejectReason')}
            </FieldLabel>
            <Textarea
              id="reject-proof-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {tried && short && (
              <FieldError>
                {t('people.actions.reasonShort', { min: 3 })}
              </FieldError>
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
                : t('bank.rejectConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Bookings still to be paid; those without any proof are confirmed outright by Accounts. */
function Bookings({
  search,
  onPage,
}: {
  search: PaymentsSearch;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const page = search.page ?? 1;
  const query = useReservationsListQuery({
    status: 'pending',
    q: search.q,
    page,
    limit: PAGE_SIZE,
  });
  const [confirming, setConfirming] = useState<ReservationDto | null>(null);
  const meta = query.data?.meta;
  if (query.isLoading) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data?.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={search.q ? t('people.noMatch') : t('payments.none.bookings')}
      />
    );
  }
  return (
    <>
      <ul className="grid gap-3">
        {rows.map((b) => {
          const nothing =
            toPoisha(b.paid) === 0n && toPoisha(b.underReview) === 0n;
          return (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"
            >
              <div className="grid gap-0.5">
                <p className="font-semibold">{b.investor.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {t('holdings.bookingNo', { id: fmt.number(b.id) })} ·{' '}
                  {b.projectTitle} ·{' '}
                  {t('projects.unitsWord', { count: b.slots })}
                </p>
                <p className="text-sm">
                  {fmt.taka(b.amount)} · {t('booking.paid')}: {fmt.taka(b.paid)}{' '}
                  · {t('booking.underReview')}: {fmt.taka(b.underReview)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {b.onHold
                    ? t('booking.onHold')
                    : t('payments.due', { at: b.expiresAt })}
                </p>
              </div>
              {role === 'accounts' && nothing && (
                <Button variant="outline" onClick={() => setConfirming(b)}>
                  <BadgeCheck /> {t('payments.confirmDirect')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {meta && (
        <Pager
          page={page}
          pages={meta.totalPages}
          total={meta.total}
          onPage={onPage}
        />
      )}
      {confirming && (
        <ConfirmDialog
          booking={confirming}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}

function ConfirmDialog({
  booking: b,
  onClose,
}: {
  booking: ReservationDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [confirm, confirming] = useReservationsConfirmMutation();
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const empty = ref.trim() === '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (empty) return;
    setError(null);
    try {
      await confirm({
        id: b.id,
        paymentReferenceDto: { paymentReference: ref.trim() },
      }).unwrap();
      toast.success(t('payments.confirmed'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('payments.confirmTitle', { amount: fmt.taka(b.amount) })}
          </DialogTitle>
          <DialogDescription>
            {t('payments.confirmText', { name: b.investor.fullName })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="confirm-ref">
              {t('payments.statementRef')}
            </FieldLabel>
            <Input
              id="confirm-ref"
              maxLength={128}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="font-mono"
            />
            {tried && empty && (
              <FieldError>{t('payments.refRequired')}</FieldError>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={confirming.isLoading}>
              {confirming.isLoading
                ? t('people.actions.working')
                : t('payments.confirmDirect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
