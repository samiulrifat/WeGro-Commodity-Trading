import { Link } from '@tanstack/react-router';
import {
  BellRing,
  CheckCheck,
  CircleCheck,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type NotificationDto,
  useNotificationsListQuery,
  useNotificationsReadAllMutation,
  useNotificationsReadMutation,
  useNotificationsUnreadQuery,
} from '@/api/generated/notifications';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { notificationText } from '@/i18n/text';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { recordLink } from './record-link';

const PAGE_SIZE = 20;
const TABS = ['all', 'unread'] as const;
type Tab = (typeof TABS)[number];

const ICON: Record<NotificationDto['category'], LucideIcon> = {
  action: BellRing,
  reminder: Clock,
  outcome: CircleCheck,
};

/**
 * The reader's own notifications, newest first: what waits for them to
 * act, reminders of deadlines, and what happened to their records. Each
 * opens its record and is marked read on the way; older ones load on
 * asking.
 */
export function InboxPage() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [tab, setTab] = useState<Tab>('all');
  // Each loaded page is asked for by the id it starts before.
  const [cursors, setCursors] = useState<Array<number | undefined>>([
    undefined,
  ]);
  const unread = useNotificationsUnreadQuery().data?.data.unread ?? 0;
  const [readAll, readingAll] = useNotificationsReadAllMutation();
  const choose = (x: Tab) => {
    setTab(x);
    setCursors([undefined]);
  };
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.notifications')}
        description={t('notificationsPage.intro')}
        actions={
          <Button
            variant="outline"
            disabled={unread === 0 || readingAll.isLoading}
            onClick={() => void readAll()}
          >
            <CheckCheck />
            {t('notificationsPage.readAll')}
          </Button>
        }
      />
      <div
        role="tablist"
        aria-label={t('notificationsPage.tabs')}
        className="flex gap-2"
      >
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => choose(x)}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === x
                ? 'border-ink bg-ink text-white'
                : 'bg-card hover:bg-muted',
            )}
          >
            {x === 'unread' && unread > 0
              ? t('notificationsPage.tab.unreadCount', {
                  n: fmt.number(unread),
                })
              : t(`notificationsPage.tab.${x}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {cursors.map((before, i) => (
          <Page
            key={`${tab}-${before ?? 'first'}`}
            unread={tab === 'unread'}
            before={before}
            first={i === 0}
            last={i === cursors.length - 1}
            onMore={(next) => setCursors((c) => [...c, next])}
          />
        ))}
      </div>
    </div>
  );
}

function Page({
  unread,
  before,
  first,
  last,
  onMore,
}: {
  unread: boolean;
  before: number | undefined;
  first: boolean;
  last: boolean;
  onMore: (before: number) => void;
}) {
  const { t } = useTranslation();
  const query = useNotificationsListQuery(
    { limit: PAGE_SIZE, before, ...(unread && { unread: true }) },
    { refetchOnMountOrArgChange: true },
  );
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) {
    return (
      <ErrorState
        error={toApiError(query.error)!}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const { items, nextBefore } = query.data.data;
  if (first && items.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title={
          unread
            ? t('notificationsPage.noneUnread')
            : t('notificationsPage.none')
        }
      />
    );
  }
  return (
    <>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((n) => (
          <li key={n.id}>
            <Item n={n} />
          </li>
        ))}
      </ul>
      {last && nextBefore != null && (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => onMore(nextBefore)}
        >
          {t('notificationsPage.older')}
        </Button>
      )}
    </>
  );
}

function Item({ n }: { n: NotificationDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const [markRead] = useNotificationsReadMutation();
  const { title, body } = notificationText(n, i18n);
  const href = recordLink(n, user);
  const Icon = ICON[n.category];
  const fresh = !n.readAt;
  const read = () => {
    if (fresh) void markRead({ id: n.id });
  };
  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
          n.category === 'action'
            ? 'bg-warning/15 text-warning'
            : n.category === 'reminder'
              ? 'bg-danger/10 text-danger'
              : 'bg-brand/10 text-brand',
        )}
      >
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span
          className={cn(
            'leading-snug',
            fresh ? 'font-semibold' : 'font-medium',
          )}
        >
          {title}
        </span>
        {body && <span className="text-sm text-muted-foreground">{body}</span>}
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {n.category !== 'outcome' && (
            <StatusPill
              tone={n.category === 'action' ? 'warning' : 'danger'}
              appearance="soft"
            >
              {t(`notificationsPage.category.${n.category}`)}
            </StatusPill>
          )}
          <time dateTime={n.createdAt}>{fmt.relative(n.createdAt)}</time>
        </span>
      </span>
      {fresh && (
        <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand">
          <span className="sr-only">{t('notificationsPage.unread')}</span>
        </span>
      )}
    </>
  );
  const row = cn('flex items-start gap-3 px-4 py-3', fresh && 'bg-brand/5');
  return href ? (
    <Link
      to={href as never}
      onClick={read}
      className={cn(
        row,
        'outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={row}>
      {content}
      {fresh && (
        <Button variant="ghost" size="sm" onClick={read}>
          {t('notificationsPage.markRead')}
        </Button>
      )}
    </div>
  );
}
