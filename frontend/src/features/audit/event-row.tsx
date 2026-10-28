import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ActivityEntryDto, HistoryEntryDto } from '@/api/generated/audit';
import { useFormat } from '@/i18n/use-format';
import { isHistoryType, shortId } from './audit-utils';
import { useAuditWords } from './words';

/**
 * One ledger event: what happened, when, who sent it, and, on the activity
 * list, the records it names (each opening that record's history). The
 * event's own values, as the ledger has them, open below on asking.
 */
export function EventRow({
  entry: e,
}: {
  entry: HistoryEntryDto | ActivityEntryDto;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const words = useAuditWords();
  const records = 'records' in e ? e.records : [];
  const who =
    e.actor.kind === 'system'
      ? t('audit.system')
      : e.actor.kind === 'participant'
        ? words.actor(e.actor.name || '—', e.actor.role)
        : t('audit.unknownActor');
  return (
    <div className="grid gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-semibold">{words.event(e.event)}</span>
        <time dateTime={e.at} className="text-sm text-muted-foreground">
          {fmt.dateTime(e.at)}
        </time>
      </div>
      <span className="text-sm text-muted-foreground">{who}</span>
      {records.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {records.map((r) =>
            isHistoryType(r.type) ? (
              <Link
                key={`${r.type}:${r.id}`}
                to="/audit/history/$type/$id"
                params={{ type: r.type, id: r.id }}
                className="inline-flex min-h-11 items-center rounded-full border bg-card px-3 text-xs font-medium hover:bg-muted"
              >
                {words.recordType(r.type)} {shortId(r.type, r.id)}
              </Link>
            ) : null,
          )}
        </span>
      )}
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          {t('audit.details')}
        </summary>
        <dl
          // The ledger's own values, as recorded: not for translating.
          translate="no"
          className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 font-mono text-xs break-all sm:grid-cols-[max-content_minmax(0,1fr)]"
        >
          {Object.entries(e.details).map(([k, v]) => (
            <Detail key={k} name={k} value={v} parties={e.parties} />
          ))}
          <dt className="text-muted-foreground">{t('audit.tx')}</dt>
          <dd>
            {e.txHash} · {t('audit.block', { n: e.blockNumber })}
          </dd>
        </dl>
      </details>
    </div>
  );
}

function Detail({
  name,
  value,
  parties,
}: {
  name: string;
  value: unknown;
  parties: Record<string, string>;
}) {
  const shown = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string') return parties[v] ? `${parties[v]} (${v})` : v;
    if (Array.isArray(v)) return v.map(shown).join(', ');
    return JSON.stringify(v);
  };
  return (
    <>
      <dt className="text-muted-foreground">{name}</dt>
      <dd>{shown(value)}</dd>
    </>
  );
}
