import { Link } from '@tanstack/react-router';
import { Play, Timer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type JobRunDto,
  type JobStatusDto,
  useJobsRunNowMutation,
  useJobsStatusQuery,
} from '@/api/generated/jobs';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { useJobWords } from './job-words';
import { useSpan } from './span';

/** While a job runs, the list is asked for this often. */
const POLL_MS = 5000;

/**
 * The jobs that run on a schedule: what each does, how often, how its last
 * run went and when the next is due, and each one's past runs. The super
 * admin can run one now and see the result.
 */
export function JobsPage() {
  const { t } = useTranslation();
  const query = useJobsStatusQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const jobs = query.data?.data ?? [];
  const busy = jobs.some((j) => j.running);
  // A second subscription to the same list asks again while one runs.
  useJobsStatusQuery(undefined, { pollingInterval: busy ? POLL_MS : 0 });
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.scheduledJobs')}
        description={t('system.jobsIntro')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && jobs.length === 0 && (
        <EmptyState icon={Timer} title={t('system.noJobs')} />
      )}
      {jobs.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {jobs.map((j) => (
            <li key={j.name}>
              <JobCard job={j} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({ job: j }: { job: JobStatusDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const words = useJobWords();
  const role = useAppSelector((s) => s.session.user!.role);
  const [run, running] = useJobsRunNowMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      const r = (await run({ name: j.name }).unwrap()).data;
      if (r.outcome === 'ok') {
        toast.success(
          t('system.ranOk', {
            job: words.title(j),
            count: r.items,
            n: fmt.number(r.items),
          }),
        );
      } else {
        toast.error(t('system.ranFailed', { job: words.title(j) }));
      }
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <article className="grid h-full content-start gap-3 rounded-2xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="font-semibold">
            <Link
              to="/system/jobs/$name"
              params={{ name: j.name }}
              className="hover:underline"
            >
              {words.title(j)}
            </Link>
          </h2>
          <p className="text-sm text-muted-foreground">
            {words.description(j)}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {j.running ? (
            <StatusPill tone="warning" appearance="soft">
              {t('system.jobRunning')}
            </StatusPill>
          ) : j.enabled ? (
            <StatusPill tone="success" appearance="soft">
              {t('system.jobScheduled')}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral" appearance="soft">
              {t('system.jobOff')}
            </StatusPill>
          )}
        </span>
      </header>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-muted-foreground">{t('system.every')}</dt>
        <dd>{words.every(j.everyMs)}</dd>
        <dt className="text-muted-foreground">{t('system.lastRun')}</dt>
        <dd>{j.lastRun ? <RunLine run={j.lastRun} /> : t('system.notYet')}</dd>
        <dt className="text-muted-foreground">{t('system.nextRun')}</dt>
        <dd>
          {j.nextRunAt
            ? fmt.dateTime(j.nextRunAt)
            : j.enabled
              ? '—'
              : t('system.nextOff')}
        </dd>
      </dl>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        {role === 'super_admin' && (
          <Button
            size="sm"
            disabled={running.isLoading || j.running}
            onClick={() => void go()}
          >
            <Play />
            {running.isLoading ? t('system.running') : t('system.runNow')}
          </Button>
        )}
        <Link
          to="/system/jobs/$name"
          params={{ name: j.name }}
          className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-brand hover:underline"
        >
          {t('system.pastRuns')}
        </Link>
      </div>
    </article>
  );
}

/** How a run went: when, the result, what it handled, who started it. */
export function RunLine({ run: r }: { run: JobRunDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const span = useSpan();
  const took =
    new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{fmt.dateTime(r.startedAt)}</span>
      <StatusPill
        tone={r.outcome === 'ok' ? 'success' : 'danger'}
        appearance="soft"
      >
        {r.outcome === 'ok' ? t('system.runOk') : t('system.runFailed')}
      </StatusPill>
      <span className="text-muted-foreground">
        {[
          t('system.items', { count: r.items, n: fmt.number(r.items) }),
          took >= 1000 ? span(took) : t('system.ms', { n: fmt.number(took) }),
          r.trigger === 'manual'
            ? t('system.byHand', { name: r.triggeredBy?.name ?? '—' })
            : t('system.onSchedule'),
        ].join(' · ')}
      </span>
      {r.error && (
        <code className="block w-full text-xs break-all text-danger">
          {r.error}
        </code>
      )}
    </span>
  );
}
