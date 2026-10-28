import { useNavigate } from '@tanstack/react-router';
import { ScrollText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type AuditLogEntryDto,
  useAuditAuditLogQuery,
} from '@/api/generated/audit';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFormat } from '@/i18n/use-format';
import { OUTCOMES, type Outcome } from './audit-utils';
import { useAuditWords } from './words';

const PAGE_SIZE = 25;

export interface LogSearch {
  /** Route pattern, such as /api/projects/:id/activate. */
  q?: string;
  outcome?: Outcome;
  from?: string;
  to?: string;
  actorId?: string;
  /** Shown while filtering by actor, so the filter can say whose. */
  actorName?: string;
  page?: number;
}

/**
 * Every write request, newest first: who sent it, to what, on which
 * records, and how it ended (refused ones too). Never the bodies. Filtered
 * by route, result, days and person.
 */
export function LogPage({ search }: { search: LogSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const route = search.q?.trim();
  const query = useAuditAuditLogQuery(
    {
      page,
      limit: PAGE_SIZE,
      route: route ? (route.startsWith('/') ? route : `/${route}`) : undefined,
      outcome: search.outcome,
      from: search.from,
      to: search.to,
      actorId: search.actorId,
    },
    { refetchOnMountOrArgChange: true },
  );
  const set = (patch: Partial<LogSearch>) =>
    void navigate({
      to: '/audit/log',
      search: { ...search, ...patch, page: undefined },
    });
  const outcomes = [
    { value: '', label: t('audit.log.anyOutcome') },
    ...OUTCOMES.map((o) => ({ value: o, label: t(`audit.log.outcome.${o}`) })),
  ];
  const meta = query.data?.meta;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.requestLog')}
        description={t('audit.logIntro')}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
        <SearchBox
          value={search.q}
          onSearch={(q) => set({ q })}
          placeholder={t('audit.log.searchRoute')}
        />
        <Select
          items={outcomes}
          value={search.outcome ?? ''}
          onValueChange={(v) =>
            set({ outcome: (v || undefined) as Outcome | undefined })
          }
        >
          <SelectTrigger
            aria-label={t('audit.log.outcomeLabel')}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {outcomes.map((o) => (
              <SelectItem key={o.value || 'any'} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Field>
          <FieldLabel htmlFor="log-from" className="sr-only">
            {t('payouts.from')}
          </FieldLabel>
          <Input
            id="log-from"
            type="date"
            aria-label={t('payouts.from')}
            value={search.from ?? ''}
            max={search.to}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="log-to" className="sr-only">
            {t('payouts.to')}
          </FieldLabel>
          <Input
            id="log-to"
            type="date"
            aria-label={t('payouts.to')}
            value={search.to ?? ''}
            min={search.from}
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </Field>
      </div>
      {search.actorId && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="neutral" appearance="soft">
            {t('audit.log.onlyActor', { name: search.actorName ?? '—' })}
          </StatusPill>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set({ actorId: undefined, actorName: undefined })}
          >
            <X />
            {t('audit.log.everyone')}
          </Button>
        </div>
      )}
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState icon={ScrollText} title={t('audit.log.none')} />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {query.data.data.map((e) => (
              <li key={e.id}>
                <LogRow
                  entry={e}
                  onActor={(a) => set({ actorId: a.id, actorName: a.name })}
                />
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({
                  to: '/audit/log',
                  search: { ...search, page: p },
                })
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function LogRow({
  entry: e,
  onActor,
}: {
  entry: AuditLogEntryDto;
  onActor: (actor: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const words = useAuditWords();
  const ids = Object.entries(e.params);
  return (
    <div className="grid gap-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <code className="text-sm font-semibold break-all">
          {e.method} {e.route}
        </code>
        <span className="flex items-center gap-2">
          <StatusPill
            tone={
              e.outcome === 'ok'
                ? 'success'
                : e.outcome === 'failed'
                  ? 'danger'
                  : 'warning'
            }
            appearance="soft"
          >
            {t(`audit.log.outcome.${e.outcome}`)} · {e.statusCode}
          </StatusPill>
        </span>
      </div>
      <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {e.actor ? (
          <button
            type="button"
            onClick={() => onActor(e.actor!)}
            className="inline-flex min-h-11 items-center font-medium text-foreground hover:underline"
          >
            {words.actor(e.actor.name, e.actor.role)}
          </button>
        ) : (
          <span>{t('audit.log.notSignedIn')}</span>
        )}
        <span>· {fmt.dateTime(e.at)}</span>
        <span>· {t('audit.log.took', { ms: fmt.number(e.durationMs) })}</span>
      </span>
      {(ids.length > 0 || e.requestId) && (
        <span className="font-mono text-xs break-all text-muted-foreground">
          {[
            ...ids.map(([k, v]) => `${k}=${v}`),
            e.requestId && `req ${e.requestId}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
