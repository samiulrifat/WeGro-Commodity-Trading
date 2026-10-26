import { Link } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type SweepDto,
  useAuditListSweepsQuery,
  useAuditStartSweepMutation,
} from '@/api/generated/audit';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { SWEEPERS } from './audit-utils';

/** While a sweep runs, its progress is asked for this often. */
const POLL_MS = 3000;

/**
 * Checks of every ledger record at once (sweeps): start one, watch it run,
 * and open what it found different.
 */
export function ChecksPage() {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const query = useAuditListSweepsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const sweeps = query.data?.data ?? [];
  const busy = sweeps.some((s) => s.status === 'running');
  // A second subscription to the same list asks again while one runs.
  useAuditListSweepsQuery(undefined, { pollingInterval: busy ? POLL_MS : 0 });
  const [start, starting] = useAuditStartSweepMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await start().unwrap();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.ledgerChecks')}
        description={t('audit.checksIntro')}
        actions={
          SWEEPERS.has(role) && (
            <Button
              disabled={busy || starting.isLoading}
              onClick={() => void go()}
            >
              <ShieldCheck />
              {busy ? t('audit.sweepRunning') : t('audit.startSweep')}
            </Button>
          )
        }
      />
      <FormError error={error} />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && sweeps.length === 0 && (
        <EmptyState icon={ShieldCheck} title={t('audit.noSweeps')} />
      )}
      {sweeps.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card px-4">
          {sweeps.map((s) => (
            <li key={s.id}>
              <SweepRow sweep={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SweepRow({ sweep: s }: { sweep: SweepDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Link
      to="/audit/checks/$sweepId"
      params={{ sweepId: s.id }}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="grid gap-0.5">
        <span className="font-semibold">
          {t('audit.sweepOf', { time: fmt.dateTime(s.startedAt) })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t('audit.startedBy', { name: s.startedBy.name })} ·{' '}
          {t('audit.checkedCount', {
            count: s.checked,
            n: fmt.number(s.checked),
          })}
        </span>
      </span>
      <SweepStatus sweep={s} />
    </Link>
  );
}

/** Running, or how it ended: all matching, some differing, or stopped. */
export function SweepStatus({ sweep: s }: { sweep: SweepDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (s.status === 'running')
    return (
      <StatusPill tone="neutral" appearance="soft">
        {t('audit.sweepStatus.running')}
      </StatusPill>
    );
  if (s.status !== 'done')
    return (
      <StatusPill tone="warning" appearance="soft">
        {t(`audit.sweepStatus.${s.status as 'failed' | 'interrupted'}`)}
      </StatusPill>
    );
  return s.mismatched > 0 ? (
    <StatusPill tone="danger" appearance="soft">
      {t('audit.differCount', {
        count: s.mismatched,
        n: fmt.number(s.mismatched),
      })}
    </StatusPill>
  ) : (
    <StatusPill tone="success" appearance="soft">
      {t('audit.allMatch')}
    </StatusPill>
  );
}
