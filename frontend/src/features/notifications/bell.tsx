import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotificationsUnreadQuery } from '@/api/generated/notifications';
import { buttonVariants } from '@/components/ui/button';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';

/** How often the unread count is asked for while the app is in view. */
const POLL_MS = 60_000;

/**
 * The bell in the top bar, with how many notifications are unread. The
 * count is cheap on the server; it is asked for every minute while the app
 * is in view, and again whenever something is marked read.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const { data } = useNotificationsUnreadQuery(undefined, {
    pollingInterval: POLL_MS,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
  });
  const unread = data?.data.unread ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label={
        unread > 0
          ? t('notificationsPage.bellUnread', {
              count: unread,
              n: fmt.number(unread),
            })
          : t('nav.notifications')
      }
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'relative',
      )}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-none font-bold text-white ring-2 ring-background"
        >
          {unread > 99 ? `${fmt.number(99)}+` : fmt.number(unread)}
        </span>
      )}
    </Link>
  );
}
