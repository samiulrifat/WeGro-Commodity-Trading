import { Link } from '@tanstack/react-router';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QueueDto, QueueItemDto } from '@/api/generated/dashboard';
import { mayOpen } from '@/app/navigation';
import { StatusPill } from '@/components/status-pill';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { useItemText } from './item-text';
import {
  DEADLINE_QUEUES,
  isKnownQueue,
  itemPath,
  QUEUE_LIST,
  type QueueKey,
} from './queues';

type Known = QueueDto & { key: QueueKey };

/**
 * The queues the role acts on or oversees: each with something waiting as
 * a card of its oldest items, linking to them and to the whole list; the
 * empty ones named on one line, so nothing is hidden.
 */
export function WaitingSection({ queues }: { queues: readonly QueueDto[] }) {
  const { t } = useTranslation();
  const known = queues.filter(isKnownQueue);
  const busy = known.filter((q) => q.count > 0);
  const clear = known.filter((q) => q.count === 0);
  return (
    <section aria-labelledby="waiting-title" className="grid gap-4">
      <h2 id="waiting-title" className="text-xl font-bold">
        {t('dashboard.waitingTitle')}
      </h2>
      {busy.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-muted-foreground">
          <CircleCheck className="size-5 text-brand" aria-hidden />
          {t('dashboard.nothingWaiting')}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {busy.map((q) => (
            <li key={q.key}>
              <QueueCard queue={q} />
            </li>
          ))}
        </ul>
      )}
      {busy.length > 0 && clear.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-brand"
            aria-hidden
          />
          <span>
            <span className="font-semibold text-foreground">
              {t('dashboard.allClear')}
            </span>{' '}
            {clear.map((q) => t(`dashboard.queue.${q.key}`)).join(' · ')}
          </span>
        </p>
      )}
    </section>
  );
}

function QueueCard({ queue: q }: { queue: Known }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const list = QUEUE_LIST[q.key];
  const canList = mayOpen(user, list.to);
  const more = q.count - q.oldest.length;
  return (
    <article className="grid h-full content-start gap-3 rounded-2xl border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug">
          {t(`dashboard.queue.${q.key}`)}
        </h3>
        <span className="text-2xl leading-none font-bold text-warning-strong">
          {fmt.number(q.count)}
        </span>
      </header>
      {q.urgent && Object.values(q.urgent).some((n) => n > 0) && (
        <span className="flex flex-wrap gap-1.5">
          {Object.entries(q.urgent)
            .filter(([, n]) => n > 0)
            .map(([kind, n]) => (
              <StatusPill key={kind} tone="danger" appearance="soft">
                {kind === 'overdue'
                  ? t('dashboard.urgent.overdue', {
                      count: n,
                      n: fmt.number(n),
                    })
                  : t('dashboard.urgent.expiringSoon', {
                      count: n,
                      n: fmt.number(n),
                    })}
              </StatusPill>
            ))}
        </span>
      )}
      <ul className="divide-y">
        {q.oldest.map((item) => (
          <li key={item.id} className="py-2">
            <QueueItem queueKey={q.key} item={item} />
          </li>
        ))}
      </ul>
      {canList && (
        <Link
          to={list.to as never}
          search={list.search as never}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          {more > 0
            ? t('dashboard.openAllMore', { n: fmt.number(more), count: more })
            : t('dashboard.openAll')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </article>
  );
}

function QueueItem({
  queueKey,
  item,
}: {
  queueKey: QueueKey;
  item: QueueItemDto;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const text = useItemText();
  const path = itemPath(queueKey, item);
  const line = text(queueKey, item.params);
  const when = DEADLINE_QUEUES.has(queueKey)
    ? t('dashboard.dueWhen', { when: fmt.relative(item.since) })
    : t('dashboard.waitingWhen', { when: fmt.relative(item.since) });
  return (
    <div className="grid gap-0.5 text-sm">
      {path && mayOpen(user, path) ? (
        <Link to={path as never} className="font-medium hover:underline">
          {line}
        </Link>
      ) : (
        <span className="font-medium">{line}</span>
      )}
      <span className="text-muted-foreground">
        {[item.project?.name, item.person?.name, when]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  );
}
