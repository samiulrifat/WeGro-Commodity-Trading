import { Link, useNavigate } from '@tanstack/react-router';
import { HandCoins } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type PaymentProofDto,
  usePaymentProofsListQuery,
} from '@/api/generated/payment-proofs';
import {
  type ProjectDto,
  type RefundLineDto,
  useProjectsListQuery,
  useProjectsRecordRefundMutation,
  useProjectsRefundsQuery,
} from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { actsAs } from '@/app/navigation';
import { usePaymentProofsRefundMutation } from './api';
import type { RefundsSearch } from './projects-search';

/**
 * What WeGro pays back: money accepted for bookings that then ended
 * unconfirmed, and the investors of cancelled projects. Accounts records
 * each refund with the reference of the transfer back.
 */
export function RefundsPage({ search }: { search: RefundsSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const set = (patch: Partial<RefundsSearch>) =>
    void navigate({ to: '/projects/refunds', search: { ...search, ...patch } });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.refunds')}
        description={t('refunds.intro')}
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => set({ q, page: undefined })}
        placeholder={t('payments.search')}
      />
      <BookingRefunds search={search} onPage={(page) => set({ page })} />
      <CancelledProjects />
    </div>
  );
}

function BookingRefunds({
  search,
  onPage,
}: {
  search: RefundsSearch;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const page = search.page ?? 1;
  const due = usePaymentProofsListQuery({
    refund: 'due',
    q: search.q,
    page,
    limit: 20,
  });
  const [recording, setRecording] = useState<PaymentProofDto | null>(null);
  const rows = due.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('refunds.bookings')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {due.isLoading && <LoadingState />}
        {due.error && (
          <ErrorState
            error={toApiError(due.error)!}
            onRetry={() => void due.refetch()}
          />
        )}
        {due.data && rows.length === 0 && (
          <EmptyState
            icon={HandCoins}
            title={search.q ? t('people.noMatch') : t('refunds.noneDue')}
          />
        )}
        <ul className="divide-y">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="grid gap-0.5">
                <Link
                  to="/people/$personId"
                  params={{ personId: p.investor.id }}
                  className="inline-flex min-h-11 items-center font-semibold hover:underline"
                >
                  {p.investor.fullName}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {t('holdings.bookingNo', { id: fmt.number(p.reservationId) })}{' '}
                  · {p.projectTitle} ·{' '}
                  {t(
                    `booking.ended.${p.reservationStatus as 'cancelled' | 'expired'}`,
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">{fmt.taka(p.amount)}</span>
                {actsAs(role, 'accounts') && (
                  <Button variant="outline" onClick={() => setRecording(p)}>
                    {t('refunds.record')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {due.data?.meta && (
          <Pager
            page={page}
            pages={due.data.meta.totalPages}
            total={due.data.meta.total}
            onPage={onPage}
          />
        )}
        {recording && (
          <RefundDialog
            amount={recording.amount}
            name={recording.investor.fullName}
            onClose={() => setRecording(null)}
            onRecord={async (ref, record) => {
              await record
                .proof({
                  id: recording.id,
                  proofRefundDto: { paymentReference: ref },
                })
                .unwrap();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CancelledProjects() {
  const { t } = useTranslation();
  const query = useProjectsListQuery({ stage: 'cancelled', limit: 50 });
  const projects = (query.data?.data ?? []).filter(
    (p) => p.refundTotal && p.refundTotal !== '0.00',
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('refunds.projects')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.isLoading && <LoadingState />}
        {query.data && projects.length === 0 && (
          <p className="text-muted-foreground">{t('refunds.noProjects')}</p>
        )}
        {projects.map((p) => (
          <ProjectRefunds key={p.id} project={p} />
        ))}
      </CardContent>
    </Card>
  );
}

const LINE_TONE = {
  due: 'warning',
  submitted: 'neutral',
  refunded: 'success',
} as const;

function ProjectRefunds({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const lines = useProjectsRefundsQuery({ id: p.id });
  const [recording, setRecording] = useState<RefundLineDto | null>(null);
  return (
    <section className="grid gap-2 rounded-xl border p-4" aria-label={p.title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: p.id }}
          className="inline-flex min-h-11 items-center font-semibold hover:underline"
        >
          {p.title}
        </Link>
        <span className="text-sm text-muted-foreground">
          {t('refunds.owed', { amount: fmt.taka(p.refundTotal ?? '0') })}
        </span>
      </div>
      <ul className="divide-y">
        {(lines.data?.data ?? []).map((l) => (
          <li
            key={l.investor.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2"
          >
            <span>
              {l.investor.fullName}
              <span className="text-sm text-muted-foreground">
                {' '}
                · {t('projects.unitsWord', { count: l.slots })}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-semibold">{fmt.taka(l.amount)}</span>
              <StatusPill tone={LINE_TONE[l.status]} appearance="soft">
                {t(`refunds.status.${l.status}`)}
              </StatusPill>
              {actsAs(role, 'accounts') && l.status === 'due' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRecording(l)}
                >
                  {t('refunds.record')}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {recording && (
        <RefundDialog
          amount={recording.amount}
          name={recording.investor.fullName}
          onClose={() => setRecording(null)}
          onRecord={async (ref, record) => {
            await record
              .project({
                id: p.id,
                recordRefundDto: {
                  investorId: recording.investor.id,
                  paymentReference: ref,
                },
              })
              .unwrap();
          }}
        />
      )}
    </section>
  );
}

/** The reference of the transfer back; recorded once. */
function RefundDialog({
  amount,
  name,
  onClose,
  onRecord,
}: {
  amount: string;
  name: string;
  onClose: () => void;
  onRecord: (
    ref: string,
    record: {
      proof: ReturnType<typeof usePaymentProofsRefundMutation>[0];
      project: ReturnType<typeof useProjectsRecordRefundMutation>[0];
    },
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [proof, proofState] = usePaymentProofsRefundMutation();
  const [project, projectState] = useProjectsRecordRefundMutation();
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const empty = ref.trim() === '';
  const busy = proofState.isLoading || projectState.isLoading;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (empty) return;
    setError(null);
    try {
      await onRecord(ref.trim(), { proof, project });
      toast.success(t('refunds.recorded'));
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
            {t('refunds.recordTitle', { amount: fmt.taka(amount), name })}
          </DialogTitle>
          <DialogDescription>{t('refunds.recordText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && empty) || undefined}>
            <FieldLabel htmlFor="refund-ref">
              {t('refunds.reference')}
            </FieldLabel>
            <Input
              id="refund-ref"
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
            <Button type="submit" disabled={busy}>
              {busy ? t('people.actions.working') : t('refunds.record')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
