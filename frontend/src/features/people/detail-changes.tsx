import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CircleCheck, CircleX, FilePenLine } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import type { District } from '@/api/generated/codes';
import {
  type DetailChangeReviewDto,
  type DetailChangeStatus,
  type DetailField,
  type OwnDetailsDto,
  useDetailChangesApproveMutation,
  useDetailChangesListQuery,
  useDetailChangesRejectMutation,
  useDetailChangesReviewQuery,
} from '@/api/generated/participants';
import { FormError } from '@/app/auth/form-error';
import type { Role } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { PersonCell } from '@/components/person-cell';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { SegmentedChoice } from '@/app/auth/segmented-choice';
import { IdCheckList } from './id-check';
import { DETAIL_FIELDS, type IdCheck, localPhone } from './person';

const PAGE_SIZE = 20;

/** The requests list's view, kept in the address. */
export interface ChangesSearch {
  status?: DetailChangeStatus;
  q?: string;
  page?: number;
}

const STATUSES: readonly DetailChangeStatus[] = [
  'pending',
  'approved',
  'rejected',
];
const TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
} as const;

/**
 * People asking to change their own details, waiting first: an admin
 * reviews everyone's but staff, the super admin the staff's.
 */
export function DetailChangesList({ search }: { search: ChangesSearch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const status = search.status ?? 'pending';
  const page = search.page ?? 1;
  const query = useDetailChangesListQuery({
    status,
    q: search.q,
    page,
    limit: PAGE_SIZE,
  });
  const go = (next: ChangesSearch) =>
    void navigate({ to: '/people/changes', search: next });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.detailChanges')}
        description={t('changes.intro')}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedChoice
          legend={t('changes.show')}
          value={status}
          onChange={(s) =>
            go({ q: search.q, status: s === 'pending' ? undefined : s })
          }
          options={STATUSES.map((s) => ({
            value: s,
            label: t(`changes.status.${s}`),
          }))}
        />
        <SearchBox
          className="min-w-64 flex-1"
          value={search.q}
          onSearch={(q) => go({ status: search.status, q })}
          placeholder={t('changes.search')}
        />
      </div>
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data?.data.length === 0 && (
        <EmptyState
          icon={FilePenLine}
          title={
            search.q
              ? t('people.noMatch')
              : t(`changes.none.${status}` as never)
          }
          description={search.q ? t('people.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <ul className="grid gap-3">
          {query.data.data.map((c) => (
            <li key={c.id}>
              <Link
                to="/people/changes/$changeId"
                params={{ changeId: c.id }}
                className="grid gap-3 rounded-xl border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <PersonCell
                  name={c.participant.name}
                  detail={`${t(`roles.${c.role as Role}`)} · ${t('changes.sent', { at: fmt.dateTime(c.createdAt) })}`}
                />
                <span className="flex flex-wrap gap-1.5 sm:justify-end">
                  {c.changedFields.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                    >
                      {t(`person.${f}`)}
                    </span>
                  ))}
                  {c.idCheckOutcome === 'flagged' && (
                    <StatusPill tone="warning" appearance="soft">
                      {t('people.flagged')}
                    </StatusPill>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {query.data && (
        <Pager
          page={page}
          pages={query.data.meta.totalPages}
          total={query.data.meta.total}
          onPage={(p) => go({ ...search, page: p })}
        />
      )}
    </div>
  );
}

/** One request: what changes, side by side, the ID check, and the decision. */
export function DetailChangeReview({ id }: { id: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const query = useDetailChangesReviewQuery({ id });
  const back = (
    <Link
      to="/people/changes"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> {t('nav.sub.detailChanges')}
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
  const change = query.data.data;
  const checks = (change.idCheck?.checks ?? []) as IdCheck[];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={change.participant.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t(`roles.${change.role as Role}`)} ·{' '}
            {t('changes.sent', { at: fmt.dateTime(change.createdAt) })}
            <StatusPill tone={TONE[change.status]} appearance="soft">
              {t(`changes.status.${change.status}`)}
            </StatusPill>
          </span>
        }
        actions={
          <Link
            to="/people/$personId"
            params={{ personId: change.participant.id }}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('changes.openPerson')}
          </Link>
        }
      />

      {change.status !== 'pending' && <Decided change={change} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('changes.compare')}</CardTitle>
          <CardDescription>{t('changes.compareIntro')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Comparison
            current={change.current}
            requested={change.requested}
            changed={change.changedFields}
          />
        </CardContent>
      </Card>

      {checks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('people.idCheck')}</CardTitle>
            <CardDescription>
              {change.idCheckOutcome === 'flagged'
                ? t('changes.flagged')
                : t('people.idCheckPassed')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IdCheckList checks={checks} />
          </CardContent>
        </Card>
      )}

      {change.status === 'pending' && <Decide change={change} />}
    </div>
  );
}

function shownValue(
  field: DetailField,
  value: string | null | undefined,
  t: (k: never) => string,
  date: (v: string) => string,
) {
  if (!value) return '—';
  if (field === 'phone') return localPhone(value);
  if (field === 'dateOfBirth') return date(value);
  if (field === 'district') return t(`districts.${value as District}` as never);
  return value;
}

/** Each detail now and as asked for; what changes is marked. */
function Comparison({
  current,
  requested,
  changed,
}: {
  current: OwnDetailsDto;
  requested: OwnDetailsDto;
  changed: readonly DetailField[];
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const show = (f: DetailField, v: string | null | undefined) =>
    shownValue(f, v, t as never, fmt.date);
  return (
    <dl className="grid gap-3">
      <div className="hidden grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 text-sm text-muted-foreground sm:grid">
        <span />
        <span>{t('changes.now')}</span>
        <span>{t('changes.asked')}</span>
      </div>
      {DETAIL_FIELDS.map((f) => {
        const differs = changed.includes(f);
        return (
          <div
            key={f}
            className={cn(
              'grid gap-1 rounded-lg p-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4',
              differs ? 'bg-warning-soft' : 'bg-muted/40',
            )}
          >
            <dt className="text-sm font-medium">
              {t(`person.${f}`)}
              {differs && (
                <span className="ml-2 text-xs text-warning-on-soft">
                  {t('changes.changes')}
                </span>
              )}
            </dt>
            <dd
              className={cn(
                'break-words',
                differs && 'text-muted-foreground line-through',
              )}
            >
              <span className="text-xs text-muted-foreground sm:hidden">
                {t('changes.now')}:{' '}
              </span>
              {show(f, current[f])}
            </dd>
            <dd className={cn('break-words', differs && 'font-semibold')}>
              <span className="text-xs font-normal text-muted-foreground sm:hidden">
                {t('changes.asked')}:{' '}
              </span>
              {show(f, requested[f])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Decided({ change }: { change: DetailChangeReviewDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const approved = change.status === 'approved';
  return (
    <Alert polite={approved} variant={approved ? 'default' : 'destructive'}>
      {approved ? <CircleCheck /> : <CircleX />}
      <AlertTitle>
        {t(`changes.decided.${change.status}` as never, {
          name: change.decidedBy?.name ?? '',
          at: change.decidedAt ? fmt.dateTime(change.decidedAt) : '',
        })}
      </AlertTitle>
      {change.reason && (
        <AlertDescription>
          {t('account.details.reason', { reason: change.reason })}
        </AlertDescription>
      )}
    </Alert>
  );
}

const REASON_MIN = 3;

/** Approve (warnings acknowledged) or reject with a reason they will read. */
function Decide({ change }: { change: DetailChangeReviewDto }) {
  const { t } = useTranslation();
  const [approve, approving] = useDetailChangesApproveMutation();
  const [reject, rejecting] = useDetailChangesRejectMutation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const flagged = change.idCheckOutcome === 'flagged';

  async function doApprove() {
    setTried(true);
    if (flagged && !acknowledged) return;
    setError(null);
    try {
      await approve({
        id: change.id,
        approveDetailChangeDto: flagged ? { acknowledgeFlags: true } : {},
      }).unwrap();
      toast.success(t('changes.approvedToast'));
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  async function doReject(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (reason.trim().length < REASON_MIN) return;
    setError(null);
    try {
      await reject({
        id: change.id,
        rejectDetailChangeDto: { reason: reason.trim() },
      }).unwrap();
      toast.success(t('changes.rejectedToast'));
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('changes.decide')}</CardTitle>
        <CardDescription>{t('changes.decideIntro')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {flagged && (
          <Field
            orientation="horizontal"
            data-invalid={(tried && !acknowledged && !rejectOpen) || undefined}
          >
            <Checkbox
              id="change-acknowledge"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v)}
            />
            <FieldLabel htmlFor="change-acknowledge" className="font-normal">
              {t('people.actions.acknowledge')}
            </FieldLabel>
          </Field>
        )}
        {rejectOpen && (
          <form
            id="reject-change"
            noValidate
            onSubmit={(e) => void doReject(e)}
            className="grid gap-3"
          >
            <Field
              data-invalid={
                (tried && reason.trim().length < REASON_MIN) || undefined
              }
            >
              <FieldLabel htmlFor="change-reason">
                {t('changes.reason')}
              </FieldLabel>
              <Textarea
                id="change-reason"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {tried && reason.trim().length < REASON_MIN && (
                <FieldError>
                  {t('people.actions.reasonShort', { min: REASON_MIN })}
                </FieldError>
              )}
            </Field>
          </form>
        )}
        <FormError error={error} />
        <div className="flex flex-wrap gap-2">
          {rejectOpen ? (
            <>
              <Button
                type="submit"
                form="reject-change"
                variant="destructive"
                disabled={rejecting.isLoading}
              >
                {t('changes.rejectConfirm')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRejectOpen(false);
                  setTried(false);
                }}
              >
                {t('people.actions.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={approving.isLoading}
                onClick={() => void doApprove()}
              >
                <CircleCheck />
                {approving.isLoading
                  ? t('people.actions.working')
                  : t('changes.approve')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setRejectOpen(true);
                  setTried(false);
                }}
              >
                <CircleX /> {t('changes.reject')}
              </Button>
            </>
          )}
        </div>
        {tried && flagged && !acknowledged && !rejectOpen && (
          <FieldError>{t('people.actions.acknowledgeFirst')}</FieldError>
        )}
      </CardContent>
    </Card>
  );
}
