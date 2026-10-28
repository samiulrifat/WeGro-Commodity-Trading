import { Link } from '@tanstack/react-router';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  useAuditFindingsQuery,
  useAuditSweepQuery,
} from '@/api/generated/audit';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useFormat } from '@/i18n/use-format';
import { isHistoryType, shortId } from './audit-utils';
import { SweepStatus } from './checks-page';
import { useAuditWords } from './words';

const PAGE_SIZE = 20;
const POLL_MS = 3000;

/** One sweep: how far it got, and each record it found different. */
export function SweepPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const words = useAuditWords();
  const [page, setPage] = useState(1);
  const sweep = useAuditSweepQuery({ id }, { refetchOnMountOrArgChange: true });
  const running = sweep.data?.data.status === 'running';
  // A second subscription to the same sweep asks again while it runs.
  useAuditSweepQuery({ id }, { pollingInterval: running ? POLL_MS : 0 });
  const findings = useAuditFindingsQuery(
    { id, page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true, pollingInterval: running ? POLL_MS : 0 },
  );
  const back = (
    <Link
      to="/audit/checks"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t('nav.sub.ledgerChecks')}
    </Link>
  );
  if (sweep.isLoading) return <LoadingState />;
  if (sweep.error || !sweep.data) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState
          error={toApiError(sweep.error)!}
          onRetry={() => void sweep.refetch()}
        />
      </div>
    );
  }
  const s = sweep.data.data;
  const rows = findings.data?.data ?? [];
  const meta = findings.data?.meta;
  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={t('audit.sweepOf', { time: fmt.dateTime(s.startedAt) })}
        description={[
          t('audit.startedBy', { name: s.startedBy.name }),
          t('audit.checkedCount', {
            count: s.checked,
            n: fmt.number(s.checked),
          }),
          s.finishedAt &&
            t('audit.finishedAt', { time: fmt.dateTime(s.finishedAt) }),
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={<SweepStatus sweep={s} />}
      />
      {s.error && (
        <p className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          {s.error}
        </p>
      )}
      {findings.data && rows.length === 0 && (
        <EmptyState
          icon={CircleCheck}
          title={running ? t('audit.noFindingsYet') : t('audit.noFindings')}
        />
      )}
      {rows.length > 0 && (
        <>
          <h2 className="text-lg font-bold">{t('audit.findingsTitle')}</h2>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {rows.map((f) => (
              <li
                key={`${f.type}:${f.recordId}`}
                className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-4"
              >
                <span className="font-semibold">
                  {isHistoryType(f.type) ? (
                    <Link
                      to="/audit/history/$type/$id"
                      params={{ type: f.type, id: f.recordId }}
                      className="hover:underline"
                    >
                      {words.recordType(f.type)} {shortId(f.type, f.recordId)}
                    </Link>
                  ) : (
                    `${words.recordType(f.type)} ${shortId(f.type, f.recordId)}`
                  )}
                </span>
                <span className="text-sm">
                  {f.mismatches.map((m) => words.mismatch(m)).join(' · ')}{' '}
                  <code className="text-xs text-muted-foreground">
                    ({f.mismatches.join(', ')})
                  </code>
                </span>
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
