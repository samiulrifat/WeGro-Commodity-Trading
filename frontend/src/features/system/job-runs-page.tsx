import { Link } from '@tanstack/react-router';
import { ArrowLeft, History } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useJobsHistoryQuery, useJobsStatusQuery } from '@/api/generated/jobs';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { RunLine } from './jobs-page';
import { useJobWords } from './job-words';

const PAGE_SIZE = 20;

/**
 * One job's past runs, newest first: those that did something, failed, or
 * were started by hand (quiet scheduled runs are not kept).
 */
export function JobRunsPage({ name }: { name: string }) {
  const { t } = useTranslation();
  const words = useJobWords();
  const [page, setPage] = useState(1);
  const job = useJobsStatusQuery().data?.data.find((j) => j.name === name);
  const query = useJobsHistoryQuery(
    { name, page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true },
  );
  const meta = query.data?.meta;
  return (
    <div className="grid gap-6">
      <Link
        to="/system/jobs"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.sub.scheduledJobs')}
      </Link>
      <PageHeader
        title={words.title({ name })}
        description={
          job ? `${words.description(job)} ${t('system.runsNote')}` : undefined
        }
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState icon={History} title={t('system.noRuns')} />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {query.data.data.map((r) => (
              <li key={`${r.startedAt}-${r.trigger}`} className="py-3 text-sm">
                <RunLine run={r} />
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
