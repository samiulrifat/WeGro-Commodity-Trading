import {
  CircleAlert,
  CircleCheck,
  CircleX,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type SystemStatusDto,
  useSystemStatusQuery,
} from '@/api/generated/jobs';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { localDigits } from '@/lib/format';
import { useSpan } from './span';

/** The status is asked for again this often while the page is open. */
const POLL_MS = 30_000;
/** A ledger clock this far from real time is worth saying (a test chain's jumps). */
const CLOCK_NOTE_MS = 10 * 60_000;

/**
 * How the platform stands, in one look: all well or what needs attention
 * first, then the database, the blockchain node, the database's copy of
 * the ledger (how far behind, against what is allowed) and the watchdog's
 * open incident. Refreshed every half minute.
 */
export function StatusPage() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const query = useSystemStatusQuery(undefined, {
    refetchOnMountOrArgChange: true,
    pollingInterval: POLL_MS,
    skipPollingIfUnfocused: true,
  });
  const s = query.data?.data;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.systemStatus')}
        description={
          s
            ? t('system.checkedAt', { time: fmt.dateTime(s.checkedAt) })
            : t('system.intro')
        }
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            {t('dashboard.refresh')}
          </Button>
        }
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {s && <Status s={s} />}
    </div>
  );
}

function Status({ s }: { s: SystemStatusDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const span = useSpan();
  const ix = s.indexer;
  const behind = ix.behind ?? null;
  const indexedBlock = ix.indexedBlock ?? null;
  const behindOk = behind === null || behind <= ix.allowedBehind;
  const clockGap = s.chain.ledgerTime
    ? new Date(s.chain.ledgerTime).getTime() - new Date(s.checkedAt).getTime()
    : 0;
  return (
    <>
      <Verdict s={s} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Part
          title={t('system.database')}
          up={s.database === 'up'}
          detail={
            s.database === 'up'
              ? t('system.databaseUp')
              : t('system.databaseDown')
          }
        />
        <Part
          title={t('system.node')}
          up={s.chain.status === 'up'}
          detail={
            s.chain.status === 'up'
              ? t('system.nodeUp', {
                  block: fmt.number(s.chain.blockNumber ?? 0),
                  // An id, not an amount: local digits, no grouping.
                  chain: localDigits(String(s.chain.chainId), fmt.lang),
                })
              : t('system.nodeDown')
          }
        >
          {s.chain.ledgerTime && (
            <p className="text-sm text-muted-foreground">
              {t('system.ledgerTime', {
                time: fmt.dateTime(s.chain.ledgerTime),
              })}
              {Math.abs(clockGap) > CLOCK_NOTE_MS && (
                <span className="block">
                  {clockGap > 0
                    ? t('system.clockAhead', { span: span(clockGap) })
                    : t('system.clockBehind', { span: span(-clockGap) })}
                </span>
              )}
            </p>
          )}
        </Part>
        <Part
          title={t('system.copy')}
          up={ix.enabled && ix.running && behindOk && ix.failures === 0}
          warn={!ix.enabled}
          detail={
            !ix.enabled
              ? t('system.copyOff')
              : behind === null
                ? t('system.copyUnknown')
                : behind === 0
                  ? t('system.copyInStep')
                  : t('system.copyBehind', {
                      count: behind,
                      n: fmt.number(behind),
                      allowed: fmt.number(ix.allowedBehind),
                    })
          }
        >
          <p className="text-sm text-muted-foreground">
            {indexedBlock !== null &&
              t('system.copiedTo', { block: fmt.number(indexedBlock) })}
          </p>
          {ix.failures > 0 && (
            <p className="text-sm text-danger">
              {t('system.failures', {
                count: ix.failures,
                n: fmt.number(ix.failures),
              })}
              {ix.lastError && (
                <code className="mt-1 block text-xs break-all">
                  {ix.lastError}
                </code>
              )}
            </p>
          )}
        </Part>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('system.uptime', { span: span(s.uptimeSeconds * 1000) })}
      </p>
    </>
  );
}

/** The one line that says whether anything needs attention. */
function Verdict({ s }: { s: SystemStatusDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (s.status === 'down') {
    return (
      <Alert variant="destructive">
        <CircleX />
        <AlertTitle>{t('system.verdict.down')}</AlertTitle>
        <AlertDescription>{t('system.verdict.downText')}</AlertDescription>
      </Alert>
    );
  }
  if (s.status === 'degraded') {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>{t('system.verdict.degraded')}</AlertTitle>
        <AlertDescription>
          {s.incident
            ? t('system.incident', {
                problem: t(`system.problem.${s.incident.problem}`),
                since: fmt.dateTime(s.incident.since),
              })
            : t('system.verdict.degradedText')}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <CircleCheck />
      <AlertTitle>{t('system.verdict.ok')}</AlertTitle>
      <AlertDescription>{t('system.verdict.okText')}</AlertDescription>
    </Alert>
  );
}

function Part({
  title,
  up,
  warn = false,
  detail,
  children,
}: {
  title: string;
  up: boolean;
  /** Not wrong, but not running either (switched off). */
  warn?: boolean;
  detail: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [tone, label, Icon]: [
    'success' | 'warning' | 'danger',
    string,
    LucideIcon,
  ] = warn
    ? ['warning', t('system.off'), CircleAlert]
    : up
      ? ['success', t('system.up'), CircleCheck]
      : ['danger', t('system.attention'), CircleX];
  return (
    <section className="grid content-start gap-2 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <StatusPill tone={tone} appearance="soft">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </StatusPill>
      </div>
      <p>{detail}</p>
      {children}
    </section>
  );
}
